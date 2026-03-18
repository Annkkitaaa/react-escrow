import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ReactEscrow, ReactiveHandlers, HookRegistry, EscrowReceiptNFT, MockRevertHook } from "../typechain-types";

// ============================================================
// Feature 4: Cross-Contract Composability (Hook Registry + NFT Receipt)
// ============================================================

const ONE_WEEK  = 7 * 24 * 3600;
const PRECOMPILE = "0x0000000000000000000000000000000000000100";

async function deployFixture() {
  const [owner, client, freelancer, arbiter, other] = await ethers.getSigners();

  const EscrowF = await ethers.getContractFactory("ReactEscrow");
  const reactEscrow = (await EscrowF.deploy()) as ReactEscrow;

  const HandlersF = await ethers.getContractFactory("ReactiveHandlers");
  const handlers = (await HandlersF.deploy(await reactEscrow.getAddress())) as ReactiveHandlers;

  const RegistryF = await ethers.getContractFactory("HookRegistry");
  const registry = (await RegistryF.deploy(await handlers.getAddress())) as HookRegistry;

  const NFTF = await ethers.getContractFactory("EscrowReceiptNFT");
  const nft = (await NFTF.deploy(await registry.getAddress())) as EscrowReceiptNFT;

  // Link everything
  await reactEscrow.connect(owner).setReactiveHandler(await handlers.getAddress());
  await handlers.connect(owner).setHookRegistry(await registry.getAddress());
  await registry.connect(owner).registerHook(await nft.getAddress());

  return { reactEscrow, handlers, registry, nft, owner, client, freelancer, arbiter, other };
}

async function activeEscrowFixture() {
  const base = await deployFixture();
  const { reactEscrow, client, freelancer, arbiter } = base;
  const now = await time.latest();
  const amount = ethers.parseEther("1");

  const tx = await reactEscrow.connect(client).createEscrow(
    freelancer.address, arbiter.address,
    [{ description: "Milestone 0", amount, deadline: BigInt(now + ONE_WEEK) }],
    { value: amount }
  );
  const receipt = await tx.wait();
  let escrowId = 1n;
  for (const log of receipt!.logs) {
    try {
      const p = reactEscrow.interface.parseLog({ data: log.data, topics: [...log.topics] });
      if (p?.name === "EscrowCreated") { escrowId = p.args.escrowId as bigint; break; }
    } catch { /* ignore */ }
  }
  return { ...base, escrowId, amount };
}

// Helper: simulate reactive handler call via precompile impersonation
async function triggerHandlerViaPrecompile(
  handlers: ReactiveHandlers,
  reactEscrow: ReactEscrow,
  escrowId: bigint,
  milestoneIndex: bigint,
  amount: bigint
) {
  await ethers.provider.send("hardhat_impersonateAccount", [PRECOMPILE]);
  await ethers.provider.send("hardhat_setBalance", [PRECOMPILE, "0x8AC7230489E80000"]);
  const precompile = await ethers.getSigner(PRECOMPILE);

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const TOPIC = ethers.id("MilestoneApproved(uint256,uint256,uint256)");
  const topics = [
    TOPIC,
    ethers.zeroPadValue(ethers.toBeHex(escrowId), 32),
  ];
  const data = abiCoder.encode(["uint256", "uint256"], [milestoneIndex, amount]);

  await handlers.connect(precompile).onEvent(
    await reactEscrow.getAddress(), topics as any, data
  );
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [PRECOMPILE]);
}

describe("Feature 4: Hook Registry + NFT Receipt", () => {

  describe("HookRegistry setup", () => {
    it("deploys with correct reactiveHandlers address", async () => {
      const { registry, handlers } = await loadFixture(deployFixture);
      expect(await registry.reactiveHandlers()).to.equal(await handlers.getAddress());
    });

    it("registers NFT hook correctly", async () => {
      const { registry, nft } = await loadFixture(deployFixture);
      expect(await registry.isRegistered(await nft.getAddress())).to.be.true;
      expect(await registry.hookCount()).to.equal(1n);
    });

    it("owner can register new hook", async () => {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await registry.connect(owner).registerHook(other.address);
      expect(await registry.isRegistered(other.address)).to.be.true;
    });

    it("reverts if registering duplicate hook", async () => {
      const { registry, owner, nft } = await loadFixture(deployFixture);
      await expect(
        registry.connect(owner).registerHook(await nft.getAddress())
      ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
    });

    it("owner can remove hook", async () => {
      const { registry, owner, nft } = await loadFixture(deployFixture);
      await registry.connect(owner).removeHook(await nft.getAddress());
      expect(await registry.isRegistered(await nft.getAddress())).to.be.false;
      expect(await registry.hookCount()).to.equal(0n);
    });

    it("reverts removing non-registered hook", async () => {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await expect(
        registry.connect(owner).removeHook(other.address)
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });

    it("non-owner cannot register hook", async () => {
      const { registry, other } = await loadFixture(deployFixture);
      await expect(
        registry.connect(other).registerHook(other.address)
      ).to.be.revertedWithCustomError(registry, "NotOwner");
    });
  });

  describe("executePostReleaseHooks access control", () => {
    it("reverts if caller is not reactiveHandlers", async () => {
      const { registry, other, freelancer, client } = await loadFixture(activeEscrowFixture);
      await expect(
        registry.connect(other).executePostReleaseHooks(1n, 0, client.address, freelancer.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(registry, "NotReactiveHandlers");
    });
  });

  describe("EscrowReceiptNFT", () => {
    it("is deployed with correct hook registry", async () => {
      const { nft, registry } = await loadFixture(deployFixture);
      expect(await nft.hookRegistry()).to.equal(await registry.getAddress());
    });

    it("mints NFT to freelancer after reactive fund release", async () => {
      const { reactEscrow, handlers, nft, client, freelancer, escrowId, amount } =
        await loadFixture(activeEscrowFixture);

      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      await reactEscrow.connect(client).approveMilestone(escrowId, 0);

      await triggerHandlerViaPrecompile(handlers, reactEscrow, escrowId, 0n, amount);

      expect(await nft.totalSupply()).to.equal(1n);
      expect(await nft.ownerOf(1n)).to.equal(freelancer.address);
    });

    it("receipt stores correct metadata", async () => {
      const { reactEscrow, handlers, nft, client, freelancer, escrowId, amount } =
        await loadFixture(activeEscrowFixture);

      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      await reactEscrow.connect(client).approveMilestone(escrowId, 0);
      await triggerHandlerViaPrecompile(handlers, reactEscrow, escrowId, 0n, amount);

      const receipt = await nft.receipts(1n);
      expect(receipt.escrowId).to.equal(escrowId);
      expect(receipt.milestoneIndex).to.equal(0n);
      expect(receipt.amount).to.equal(amount);
      expect(receipt.freelancer).to.equal(freelancer.address);
    });

    it("tokenURI returns valid base64 JSON", async () => {
      const { reactEscrow, handlers, nft, client, freelancer, escrowId, amount } =
        await loadFixture(activeEscrowFixture);

      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      await reactEscrow.connect(client).approveMilestone(escrowId, 0);
      await triggerHandlerViaPrecompile(handlers, reactEscrow, escrowId, 0n, amount);

      const uri = await nft.tokenURI(1n);
      expect(uri).to.include("data:application/json;base64,");
    });

    it("NFT is soulbound — transferFrom reverts", async () => {
      const { reactEscrow, handlers, nft, client, freelancer, escrowId, amount } =
        await loadFixture(activeEscrowFixture);

      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      await reactEscrow.connect(client).approveMilestone(escrowId, 0);
      await triggerHandlerViaPrecompile(handlers, reactEscrow, escrowId, 0n, amount);

      const [,,,,,,, , other2] = await ethers.getSigners();
      await expect(
        nft.connect(freelancer).transferFrom(freelancer.address, other2.address, 1n)
      ).to.be.revertedWithCustomError(nft, "Soulbound");
    });

    it("onMilestoneReleased reverts if not called by hookRegistry", async () => {
      const { nft, other, client, freelancer } = await loadFixture(activeEscrowFixture);
      await expect(
        nft.connect(other).onMilestoneReleased(1n, 0, client.address, freelancer.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(nft, "NotHookRegistry");
    });
  });

  describe("One failing hook doesn't block others", () => {
    it("registry still emits HooksExecuted even if a hook reverts", async () => {
      const { registry, handlers, owner, client, freelancer } =
        await loadFixture(activeEscrowFixture);

      // Deploy a real contract that always reverts in onMilestoneReleased
      const MockF = await ethers.getContractFactory("MockRevertHook");
      const revertHook = (await MockF.deploy()) as MockRevertHook;
      await registry.connect(owner).registerHook(await revertHook.getAddress());

      // executePostReleaseHooks should not revert despite the hook always failing
      await ethers.provider.send("hardhat_impersonateAccount", [await handlers.getAddress()]);
      await ethers.provider.send("hardhat_setBalance", [await handlers.getAddress(), "0x8AC7230489E80000"]);
      const handlerSigner = await ethers.getSigner(await handlers.getAddress());

      await expect(registry.connect(handlerSigner).executePostReleaseHooks(
        1n, 0, client.address, freelancer.address, ethers.parseEther("1")
      )).to.emit(registry, "HooksExecuted");

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [await handlers.getAddress()]);
    });
  });

  describe("ReactiveHandlers — setHookRegistry", () => {
    it("owner can set hook registry", async () => {
      const { handlers, registry, owner } = await loadFixture(deployFixture);
      expect(await handlers.hookRegistry()).to.equal(await registry.getAddress());
    });

    it("non-owner cannot set hook registry", async () => {
      const { handlers, other } = await loadFixture(deployFixture);
      await expect(
        handlers.connect(other).setHookRegistry(other.address)
      ).to.be.revertedWithCustomError(handlers, "NotOwner");
    });

    it("address(0) disables hooks", async () => {
      const { handlers, owner } = await loadFixture(deployFixture);
      await handlers.connect(owner).setHookRegistry(ethers.ZeroAddress);
      expect(await handlers.hookRegistry()).to.equal(ethers.ZeroAddress);
    });
  });
});
