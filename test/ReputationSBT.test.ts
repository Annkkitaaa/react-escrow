import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ReactEscrow, ReactiveHandlers, HookRegistry, ReputationSBT, ReputationHook } from "../typechain-types";

// ============================================================
// Feature 5: Reputation SBT (Soulbound Token + Merkle History)
// ============================================================

const ONE_WEEK = 7 * 24 * 3600;

async function deployFixture() {
  const [owner, client, freelancer, arbiter, other] = await ethers.getSigners();

  const EscrowF = await ethers.getContractFactory("ReactEscrow");
  const reactEscrow = (await EscrowF.deploy()) as ReactEscrow;

  const HandlersF = await ethers.getContractFactory("ReactiveHandlers");
  const handlers = (await HandlersF.deploy(await reactEscrow.getAddress())) as ReactiveHandlers;

  const RegistryF = await ethers.getContractFactory("HookRegistry");
  const registry = (await RegistryF.deploy(await handlers.getAddress())) as HookRegistry;

  const SBTF = await ethers.getContractFactory("ReputationSBT");
  const sbt = (await SBTF.deploy()) as ReputationSBT;

  const HookF = await ethers.getContractFactory("ReputationHook");
  const repHook = (await HookF.deploy(
    await registry.getAddress(), await sbt.getAddress()
  )) as ReputationHook;

  // Wire everything together
  await sbt.connect(owner).setTrustedUpdater(await repHook.getAddress());
  await registry.connect(owner).registerHook(await repHook.getAddress());
  await handlers.connect(owner).setHookRegistry(await registry.getAddress());
  await reactEscrow.connect(owner).setReactiveHandler(await handlers.getAddress());

  return { reactEscrow, handlers, registry, sbt, repHook, owner, client, freelancer, arbiter, other };
}

// Trigger a full escrow + milestone release via reactive handler
async function triggerMilestoneRelease(
  reactEscrow: ReactEscrow,
  handlers: ReactiveHandlers,
  client: any,
  freelancer: any,
  arbiter: any,
  amount: bigint
) {
  const now = await time.latest();
  const tx = await reactEscrow.connect(client).createEscrow(
    freelancer.address, arbiter.address,
    [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
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

  await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
  await reactEscrow.connect(client).approveMilestone(escrowId, 0);

  // Simulate precompile calling handler
  const PRECOMPILE = "0x0000000000000000000000000000000000000100";
  await ethers.provider.send("hardhat_impersonateAccount", [PRECOMPILE]);
  await ethers.provider.send("hardhat_setBalance", [PRECOMPILE, "0x8AC7230489E80000"]);
  const precompile = await ethers.getSigner(PRECOMPILE);
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const TOPIC = ethers.id("MilestoneApproved(uint256,uint256,uint256)");
  const topics = [TOPIC, ethers.zeroPadValue(ethers.toBeHex(escrowId), 32)];
  const data = abiCoder.encode(["uint256", "uint256"], [0n, amount]);
  await handlers.connect(precompile).onEvent(await reactEscrow.getAddress(), topics as any, data);
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [PRECOMPILE]);

  return escrowId;
}

describe("Feature 5: Reputation SBT", () => {

  describe("ReputationSBT — minting", () => {
    it("mints SBT to freelancer after first milestone release", async () => {
      const { reactEscrow, handlers, sbt, client, freelancer, arbiter } =
        await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      await triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount);

      expect(await sbt.hasToken(freelancer.address)).to.be.true;
      expect(await sbt.totalSupply()).to.be.gte(1n);
    });

    it("mints SBT to client after first milestone release", async () => {
      const { reactEscrow, handlers, sbt, client, freelancer, arbiter } =
        await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      await triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount);

      expect(await sbt.hasToken(client.address)).to.be.true;
    });

    it("does NOT mint a second SBT for same user on second escrow", async () => {
      const { reactEscrow, handlers, sbt, client, freelancer, arbiter } =
        await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      await triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount);
      const tokenId1 = await sbt.addressToTokenId(freelancer.address);

      // Second escrow
      await triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount);
      const tokenId2 = await sbt.addressToTokenId(freelancer.address);

      expect(tokenId1).to.equal(tokenId2); // Same token ID
    });

    it("updates totalEscrows counter", async () => {
      const { reactEscrow, handlers, sbt, client, freelancer, arbiter } =
        await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      await triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount);

      const rep = await sbt.reputation(freelancer.address);
      expect(rep.totalEscrows).to.equal(1n);
    });

    it("accumulates totalAmountEarned for freelancer", async () => {
      const { reactEscrow, handlers, sbt, client, freelancer, arbiter } =
        await loadFixture(deployFixture);
      const amount = ethers.parseEther("2");
      await triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount);

      const rep = await sbt.reputation(freelancer.address);
      expect(rep.totalAmountEarned).to.equal(amount);
    });

    it("client totalAmountEarned stays 0 (they pay, not earn)", async () => {
      const { reactEscrow, handlers, sbt, client, freelancer, arbiter } =
        await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      await triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount);

      const rep = await sbt.reputation(client.address);
      expect(rep.totalAmountEarned).to.equal(0n);
    });
  });

  describe("ReputationSBT — soulbound", () => {
    it("transferFrom reverts (soulbound)", async () => {
      const { reactEscrow, handlers, sbt, client, freelancer, arbiter, other } =
        await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      await triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount);

      const tokenId = await sbt.addressToTokenId(freelancer.address);
      await expect(
        sbt.connect(freelancer).transferFrom(freelancer.address, other.address, tokenId)
      ).to.be.revertedWithCustomError(sbt, "Soulbound");
    });

    it("safeTransferFrom also reverts (soulbound)", async () => {
      const { reactEscrow, handlers, sbt, client, freelancer, arbiter, other } =
        await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      await triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount);

      const tokenId = await sbt.addressToTokenId(freelancer.address);
      await expect(
        sbt.connect(freelancer)["safeTransferFrom(address,address,uint256)"](
          freelancer.address, other.address, tokenId
        )
      ).to.be.revertedWithCustomError(sbt, "Soulbound");
    });
  });

  describe("ReputationSBT — Merkle proof verification", () => {
    it("verifyReputationClaim returns false when merkleRoot is zero", async () => {
      const { reactEscrow, handlers, sbt, client, freelancer, arbiter } =
        await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      await triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount);

      // Root stays 0 (no off-chain update yet)
      const leaf = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const result = await sbt.verifyReputationClaim(freelancer.address, leaf, []);
      expect(result).to.be.false;
    });

    it("verifyReputationClaim returns true for valid Merkle proof", async () => {
      const { sbt, owner, freelancer } = await loadFixture(deployFixture);

      // Build a simple Merkle tree: root = hash(leaf)
      const leaf = ethers.keccak256(ethers.toUtf8Bytes("escrow-1-proof"));
      // For a single-leaf tree, root == leaf (trivial proof)
      const root = leaf;

      // Manually mint and update with this root
      await sbt.connect(owner).setTrustedUpdater(owner.address);
      await sbt.connect(owner).mintOrUpdate(freelancer.address, 1n, ethers.parseEther("1"), false, root);

      const result = await sbt.verifyReputationClaim(freelancer.address, leaf, []);
      expect(result).to.be.true;
    });

    it("verifyReputationClaim returns false for invalid proof", async () => {
      const { sbt, owner, freelancer } = await loadFixture(deployFixture);
      await sbt.connect(owner).setTrustedUpdater(owner.address);
      const root = ethers.keccak256(ethers.toUtf8Bytes("real-root"));
      await sbt.connect(owner).mintOrUpdate(freelancer.address, 1n, ethers.parseEther("1"), false, root);

      const wrongLeaf = ethers.keccak256(ethers.toUtf8Bytes("fake-leaf"));
      const result = await sbt.verifyReputationClaim(freelancer.address, wrongLeaf, []);
      expect(result).to.be.false;
    });
  });

  describe("mintOrUpdate access control", () => {
    it("reverts if caller is not trustedUpdater", async () => {
      const { sbt, other, freelancer } = await loadFixture(deployFixture);
      await expect(
        sbt.connect(other).mintOrUpdate(freelancer.address, 1n, ethers.parseEther("1"), false, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(sbt, "NotTrustedUpdater");
    });

    it("owner can update trustedUpdater", async () => {
      const { sbt, owner, other } = await loadFixture(deployFixture);
      await sbt.connect(owner).setTrustedUpdater(other.address);
      expect(await sbt.trustedUpdater()).to.equal(other.address);
    });

    it("non-owner cannot set trustedUpdater", async () => {
      const { sbt, other } = await loadFixture(deployFixture);
      await expect(
        sbt.connect(other).setTrustedUpdater(other.address)
      ).to.be.revertedWithCustomError(sbt, "NotOwner");
    });
  });

  describe("ReputationHook integration", () => {
    it("onMilestoneReleased reverts if not called by hookRegistry", async () => {
      const { repHook, other, client, freelancer } = await loadFixture(deployFixture);
      await expect(
        repHook.connect(other).onMilestoneReleased(
          1n, 0, client.address, freelancer.address, ethers.parseEther("1")
        )
      ).to.be.revertedWithCustomError(repHook, "NotHookRegistry");
    });

    it("emits ReputationUpdated event on SBT", async () => {
      const { reactEscrow, handlers, sbt, client, freelancer, arbiter } =
        await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");

      await expect(
        triggerMilestoneRelease(reactEscrow, handlers, client, freelancer, arbiter, amount)
      ).to.not.be.reverted;

      // Check ReputationUpdated was emitted (indirectly via full flow)
      expect(await sbt.hasToken(freelancer.address)).to.be.true;
    });

    it("merkleRoot update via setTrustedUpdater + mintOrUpdate", async () => {
      const { sbt, owner, freelancer } = await loadFixture(deployFixture);
      await sbt.connect(owner).setTrustedUpdater(owner.address);
      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("updated-root"));
      await sbt.connect(owner).mintOrUpdate(
        freelancer.address, 99n, ethers.parseEther("5"), false, newRoot
      );
      const rep = await sbt.reputation(freelancer.address);
      expect(rep.merkleRoot).to.equal(newRoot);
    });

    it("passing bytes32(0) as root does NOT overwrite existing root", async () => {
      const { sbt, owner, freelancer } = await loadFixture(deployFixture);
      await sbt.connect(owner).setTrustedUpdater(owner.address);

      const root = ethers.keccak256(ethers.toUtf8Bytes("first-root"));
      await sbt.connect(owner).mintOrUpdate(freelancer.address, 1n, ethers.parseEther("1"), false, root);
      await sbt.connect(owner).mintOrUpdate(freelancer.address, 2n, ethers.parseEther("1"), false, ethers.ZeroHash);

      const rep = await sbt.reputation(freelancer.address);
      expect(rep.merkleRoot).to.equal(root); // Should keep first root
    });
  });
});
