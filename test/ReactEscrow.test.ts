import { ethers, network } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ReactEscrow, ReactiveHandlers } from "../typechain-types";

// ============================================================
// ReactEscrow — Comprehensive Test Suite
// ============================================================

const PRECOMPILE = "0x0000000000000000000000000000000000000100";
const ONE_WEEK   = 7 * 24 * 3600;
const abiCoder   = ethers.AbiCoder.defaultAbiCoder();

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------

async function deployFixture() {
  const [owner, client, freelancer, arbiter, other] = await ethers.getSigners();

  const ReactEscrowF = await ethers.getContractFactory("ReactEscrow");
  const reactEscrow  = (await ReactEscrowF.deploy()) as ReactEscrow;

  const HandlersF = await ethers.getContractFactory("ReactiveHandlers");
  const handlers  = (await HandlersF.deploy(await reactEscrow.getAddress())) as ReactiveHandlers;

  return { reactEscrow, handlers, owner, client, freelancer, arbiter, other };
}

/** Escrow 1: Active, 2 milestones (1 ETH + 2 ETH = 3 ETH), no handler set */
async function activeEscrowFixture() {
  const { reactEscrow, handlers, owner, client, freelancer, arbiter, other } =
    await deployFixture();

  const now = await time.latest();
  const milestones = [
    { description: "Milestone 0", amount: ethers.parseEther("1"), deadline: BigInt(now + ONE_WEEK) },
    { description: "Milestone 1", amount: ethers.parseEther("2"), deadline: BigInt(now + 2 * ONE_WEEK) },
  ];
  const total = ethers.parseEther("3");

  const tx = await reactEscrow
    .connect(client)
    .createEscrow(freelancer.address, arbiter.address, milestones, { value: total });
  const receipt = await tx.wait();

  // Parse escrowId from EscrowCreated event
  let escrowId = 1n;
  for (const log of receipt!.logs) {
    try {
      const p = reactEscrow.interface.parseLog({ data: log.data, topics: [...log.topics] });
      if (p?.name === "EscrowCreated") { escrowId = p.args.escrowId as bigint; break; }
    } catch { /* ignore */ }
  }

  return { reactEscrow, handlers, owner, client, freelancer, arbiter, other, milestones, escrowId, total };
}

/** Escrow 1: Active, milestone 0 submitted */
async function submittedMilestoneFixture() {
  const base = await activeEscrowFixture();
  await base.reactEscrow.connect(base.freelancer).submitMilestone(base.escrowId, 0);
  return base;
}

/** Escrow 1: Active, handler set — approveMilestone will NOT auto-release */
async function activeEscrowWithHandlerFixture() {
  const base = await activeEscrowFixture();
  await base.reactEscrow
    .connect(base.owner)
    .setReactiveHandler(await base.handlers.getAddress());
  return base;
}

/** Escrow 1: Active + handler set + milestone 0 submitted */
async function submittedWithHandlerFixture() {
  const base = await activeEscrowWithHandlerFixture();
  await base.reactEscrow.connect(base.freelancer).submitMilestone(base.escrowId, 0);
  return base;
}

// ----------------------------------------------------------------
// Handler event encoders (mirrors EVM event layout)
// ----------------------------------------------------------------

function encodeMilestoneApproved(escrowId: bigint, milestoneIndex: bigint, amount: bigint) {
  return {
    topics: [
      ethers.id("MilestoneApproved(uint256,uint256,uint256)"),
      ethers.zeroPadValue(ethers.toBeHex(escrowId), 32),
    ],
    data: abiCoder.encode(["uint256", "uint256"], [milestoneIndex, amount]),
  };
}

function encodeDeadlineReached(escrowId: bigint, milestoneIndex: bigint) {
  return {
    topics: [
      ethers.id("DeadlineReached(uint256,uint256)"),
      ethers.zeroPadValue(ethers.toBeHex(escrowId), 32),
    ],
    data: abiCoder.encode(["uint256"], [milestoneIndex]),
  };
}

function encodeDisputeResolved(escrowId: bigint, milestoneIndex: bigint, resolution: number) {
  return {
    topics: [
      ethers.id("DisputeResolved(uint256,uint256,uint8)"),
      ethers.zeroPadValue(ethers.toBeHex(escrowId), 32),
    ],
    data: abiCoder.encode(["uint256", "uint8"], [milestoneIndex, resolution]),
  };
}

async function impersonatePrecompile() {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [PRECOMPILE] });
  await network.provider.send("hardhat_setBalance", [
    PRECOMPILE,
    ethers.toBeHex(ethers.parseEther("10")),
  ]);
  return await ethers.getSigner(PRECOMPILE);
}

async function stopImpersonation() {
  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [PRECOMPILE],
  });
}

// ================================================================
// Tests
// ================================================================

describe("ReactEscrow", function () {

  // ----------------------------------------------------------------
  describe("Deployment", function () {
    it("sets owner correctly", async () => {
      const { reactEscrow, owner } = await loadFixture(deployFixture);
      expect(await reactEscrow.owner()).to.equal(owner.address);
    });

    it("starts with zero reactive handler", async () => {
      const { reactEscrow } = await loadFixture(deployFixture);
      expect(await reactEscrow.reactiveHandler()).to.equal(ethers.ZeroAddress);
    });

    it("starts with 0 escrows", async () => {
      const { reactEscrow } = await loadFixture(deployFixture);
      expect(await reactEscrow.escrowCount()).to.equal(0n);
    });

    it("owner sets reactive handler", async () => {
      const { reactEscrow, handlers, owner } = await loadFixture(deployFixture);
      await reactEscrow.connect(owner).setReactiveHandler(await handlers.getAddress());
      expect(await reactEscrow.reactiveHandler()).to.equal(await handlers.getAddress());
    });

    it("non-owner cannot set reactive handler", async () => {
      const { reactEscrow, handlers, other } = await loadFixture(deployFixture);
      await expect(
        reactEscrow.connect(other).setReactiveHandler(await handlers.getAddress())
      ).to.be.revertedWithCustomError(reactEscrow, "NotOwner");
    });
  });

  // ----------------------------------------------------------------
  describe("createEscrow", function () {
    it("creates with payment → Active status, emits both events", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const ms = [{ description: "M0", amount: ethers.parseEther("1"), deadline: BigInt(now + ONE_WEEK) }];

      await expect(
        reactEscrow.connect(client).createEscrow(freelancer.address, arbiter.address, ms, {
          value: ethers.parseEther("1"),
        })
      )
        .to.emit(reactEscrow, "EscrowCreated")
        .and.to.emit(reactEscrow, "FundsDeposited");

      const [c, f, a, total, status] = await reactEscrow.getEscrow(1n);
      expect(c).to.equal(client.address);
      expect(f).to.equal(freelancer.address);
      expect(a).to.equal(arbiter.address);
      expect(total).to.equal(ethers.parseEther("1"));
      expect(status).to.equal(2n); // Active
    });

    it("creates without payment → Created status", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const ms = [{ description: "M0", amount: ethers.parseEther("1"), deadline: BigInt(now + ONE_WEEK) }];
      await reactEscrow.connect(client).createEscrow(freelancer.address, arbiter.address, ms);
      const [, , , , status] = await reactEscrow.getEscrow(1n);
      expect(status).to.equal(0n); // Created
    });

    it("increments escrow count", async () => {
      const { reactEscrow, escrowId } = await loadFixture(activeEscrowFixture);
      expect(await reactEscrow.escrowCount()).to.equal(1n);
      expect(escrowId).to.equal(1n);
    });

    it("stores milestones correctly", async () => {
      const { reactEscrow, escrowId, milestones } = await loadFixture(activeEscrowFixture);
      const stored = await reactEscrow.getMilestones(escrowId);
      expect(stored.length).to.equal(2);
      expect(stored[0].description).to.equal(milestones[0].description);
      expect(stored[0].amount).to.equal(milestones[0].amount);
      expect(stored[0].status).to.equal(0n); // Pending
    });

    it("indexes by client and freelancer", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(activeEscrowFixture);
      expect(await reactEscrow.getEscrowsByClient(client.address)).to.deep.equal([escrowId]);
      expect(await reactEscrow.getEscrowsByFreelancer(freelancer.address)).to.deep.equal([escrowId]);
    });

    it("reverts if freelancer == caller", async () => {
      const { reactEscrow, client, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        reactEscrow
          .connect(client)
          .createEscrow(client.address, arbiter.address, [
            { description: "M", amount: 1n, deadline: BigInt(now + ONE_WEEK) },
          ])
      ).to.be.revertedWithCustomError(reactEscrow, "InvalidFreelancer");
    });

    it("reverts if freelancer == zero address", async () => {
      const { reactEscrow, client, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        reactEscrow
          .connect(client)
          .createEscrow(ethers.ZeroAddress, arbiter.address, [
            { description: "M", amount: 1n, deadline: BigInt(now + ONE_WEEK) },
          ])
      ).to.be.revertedWithCustomError(reactEscrow, "InvalidFreelancer");
    });

    it("reverts with no milestones", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      await expect(
        reactEscrow.connect(client).createEscrow(freelancer.address, arbiter.address, [])
      ).to.be.revertedWithCustomError(reactEscrow, "NoMilestones");
    });

    it("reverts if milestone amount is 0", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        reactEscrow
          .connect(client)
          .createEscrow(freelancer.address, arbiter.address, [
            { description: "M", amount: 0n, deadline: BigInt(now + ONE_WEEK) },
          ])
      ).to.be.revertedWithCustomError(reactEscrow, "MilestoneAmountZero");
    });

    it("reverts if deadline in past", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        reactEscrow
          .connect(client)
          .createEscrow(freelancer.address, arbiter.address, [
            { description: "M", amount: 1n, deadline: BigInt(now - 1) },
          ])
      ).to.be.revertedWithCustomError(reactEscrow, "DeadlineMustBeFuture");
    });

    it("reverts if ETH sent != totalAmount", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        reactEscrow
          .connect(client)
          .createEscrow(
            freelancer.address,
            arbiter.address,
            [{ description: "M", amount: ethers.parseEther("1"), deadline: BigInt(now + ONE_WEEK) }],
            { value: ethers.parseEther("0.5") }
          )
      ).to.be.revertedWithCustomError(reactEscrow, "IncorrectAmount");
    });
  });

  // ----------------------------------------------------------------
  describe("depositFunds", function () {
    it("deposits and moves to Active, emits FundsDeposited", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      await reactEscrow
        .connect(client)
        .createEscrow(freelancer.address, arbiter.address, [
          { description: "M", amount: ethers.parseEther("1"), deadline: BigInt(now + ONE_WEEK) },
        ]);

      await expect(
        reactEscrow.connect(client).depositFunds(1n, { value: ethers.parseEther("1") })
      ).to.emit(reactEscrow, "FundsDeposited").withArgs(1n, ethers.parseEther("1"));

      const [, , , , status] = await reactEscrow.getEscrow(1n);
      expect(status).to.equal(2n); // Active
    });

    it("reverts if already active (AlreadyFunded)", async () => {
      const { reactEscrow, client, escrowId } = await loadFixture(activeEscrowFixture);
      await expect(
        reactEscrow.connect(client).depositFunds(escrowId, { value: ethers.parseEther("3") })
      ).to.be.revertedWithCustomError(reactEscrow, "AlreadyFunded");
    });

    it("reverts if not client", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      await reactEscrow
        .connect(client)
        .createEscrow(freelancer.address, arbiter.address, [
          { description: "M", amount: ethers.parseEther("1"), deadline: BigInt(now + ONE_WEEK) },
        ]);
      await expect(
        reactEscrow.connect(freelancer).depositFunds(1n, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(reactEscrow, "NotClient");
    });

    it("reverts if wrong amount", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      await reactEscrow
        .connect(client)
        .createEscrow(freelancer.address, arbiter.address, [
          { description: "M", amount: ethers.parseEther("1"), deadline: BigInt(now + ONE_WEEK) },
        ]);
      await expect(
        reactEscrow.connect(client).depositFunds(1n, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWithCustomError(reactEscrow, "IncorrectAmount");
    });
  });

  // ----------------------------------------------------------------
  describe("submitMilestone", function () {
    it("freelancer submits current milestone → Submitted", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(activeEscrowFixture);
      await expect(reactEscrow.connect(freelancer).submitMilestone(escrowId, 0))
        .to.emit(reactEscrow, "MilestoneSubmitted")
        .withArgs(escrowId, 0n);
      const ms = await reactEscrow.getMilestones(escrowId);
      expect(ms[0].status).to.equal(1n); // Submitted
    });

    it("reverts if not freelancer", async () => {
      const { reactEscrow, client, escrowId } = await loadFixture(activeEscrowFixture);
      await expect(
        reactEscrow.connect(client).submitMilestone(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "NotFreelancer");
    });

    it("reverts if not current milestone (skipping ahead)", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(activeEscrowFixture);
      await expect(
        reactEscrow.connect(freelancer).submitMilestone(escrowId, 1) // should be 0 first
      ).to.be.revertedWithCustomError(reactEscrow, "NotCurrentMilestone");
    });

    it("reverts if already submitted", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(submittedMilestoneFixture);
      await expect(
        reactEscrow.connect(freelancer).submitMilestone(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongMilestoneStatus");
    });

    it("reverts if escrow not Active", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      // Create without payment → status = Created
      await reactEscrow
        .connect(client)
        .createEscrow(freelancer.address, arbiter.address, [
          { description: "M", amount: ethers.parseEther("1"), deadline: BigInt(now + ONE_WEEK) },
        ]);
      await expect(
        reactEscrow.connect(freelancer).submitMilestone(1n, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongStatus");
    });
  });

  // ----------------------------------------------------------------
  describe("approveMilestone — no handler (auto-release fallback)", function () {
    it("approves and auto-releases funds, emits MilestoneApproved + FundsReleased", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(submittedMilestoneFixture);

      const tx = reactEscrow.connect(client).approveMilestone(escrowId, 0);
      await expect(tx)
        .to.emit(reactEscrow, "MilestoneApproved").withArgs(escrowId, 0n, ethers.parseEther("1"))
        .and.to.emit(reactEscrow, "FundsReleased").withArgs(escrowId, 0n, freelancer.address, ethers.parseEther("1"));
      await expect(tx).to.changeEtherBalance(freelancer, ethers.parseEther("1"));

      const ms = await reactEscrow.getMilestones(escrowId);
      expect(ms[0].status).to.equal(4n); // Released
    });

    it("reverts if not client", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(submittedMilestoneFixture);
      await expect(
        reactEscrow.connect(freelancer).approveMilestone(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "NotClient");
    });

    it("reverts if milestone not Submitted", async () => {
      const { reactEscrow, client, escrowId } = await loadFixture(activeEscrowFixture);
      await expect(
        reactEscrow.connect(client).approveMilestone(escrowId, 0) // still Pending
      ).to.be.revertedWithCustomError(reactEscrow, "WrongMilestoneStatus");
    });

    it("reverts if escrow not Active", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      await reactEscrow
        .connect(client)
        .createEscrow(freelancer.address, arbiter.address, [
          { description: "M", amount: ethers.parseEther("1"), deadline: BigInt(now + ONE_WEEK) },
        ]);
      await expect(
        reactEscrow.connect(client).approveMilestone(1n, 0) // not yet Active
      ).to.be.revertedWithCustomError(reactEscrow, "WrongStatus");
    });
  });

  // ----------------------------------------------------------------
  describe("approveMilestone — with handler set (no auto-release)", function () {
    it("sets status Approved but does NOT release funds", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(submittedWithHandlerFixture);

      const balanceBefore = await ethers.provider.getBalance(freelancer.address);
      await reactEscrow.connect(client).approveMilestone(escrowId, 0);
      const balanceAfter = await ethers.provider.getBalance(freelancer.address);

      expect(balanceAfter).to.equal(balanceBefore); // no funds moved yet
      const ms = await reactEscrow.getMilestones(escrowId);
      expect(ms[0].status).to.equal(2n); // Approved, not Released
    });
  });

  // ----------------------------------------------------------------
  describe("releaseMilestoneFunds", function () {
    it("client releases (fallback path) → funds sent to freelancer", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(submittedWithHandlerFixture);
      await reactEscrow.connect(client).approveMilestone(escrowId, 0);

      await expect(
        reactEscrow.connect(client).releaseMilestoneFunds(escrowId, 0)
      ).to.changeEtherBalance(freelancer, ethers.parseEther("1"));

      const ms = await reactEscrow.getMilestones(escrowId);
      expect(ms[0].status).to.equal(4n); // Released
    });

    it("reverts for unauthorized caller", async () => {
      const { reactEscrow, other, escrowId } = await loadFixture(submittedWithHandlerFixture);
      await expect(
        reactEscrow.connect(other).releaseMilestoneFunds(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "NotAuthorized");
    });

    it("reverts if milestone not Approved", async () => {
      // Milestone is Submitted, not Approved
      const { reactEscrow, client, escrowId } = await loadFixture(submittedWithHandlerFixture);
      await expect(
        reactEscrow.connect(client).releaseMilestoneFunds(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongMilestoneStatus");
    });

    it("prevents double-release", async () => {
      const { reactEscrow, client, escrowId } = await loadFixture(submittedWithHandlerFixture);
      await reactEscrow.connect(client).approveMilestone(escrowId, 0);
      await reactEscrow.connect(client).releaseMilestoneFunds(escrowId, 0);

      await expect(
        reactEscrow.connect(client).releaseMilestoneFunds(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongMilestoneStatus");
    });
  });

  // ----------------------------------------------------------------
  describe("Timeout flow", function () {
    it("checkAndTriggerTimeout emits DeadlineReached after deadline", async () => {
      const { reactEscrow, other, escrowId } = await loadFixture(submittedMilestoneFixture);
      await time.increase(ONE_WEEK + 1);
      await expect(reactEscrow.connect(other).checkAndTriggerTimeout(escrowId, 0))
        .to.emit(reactEscrow, "DeadlineReached").withArgs(escrowId, 0n);
    });

    it("checkAndTriggerTimeout reverts before deadline", async () => {
      const { reactEscrow, other, escrowId } = await loadFixture(submittedMilestoneFixture);
      await expect(
        reactEscrow.connect(other).checkAndTriggerTimeout(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "DeadlineNotPassed");
    });

    it("checkAndTriggerTimeout reverts if wrong milestone status (Approved, not Released)", async () => {
      // With handler set: approve sets status=Approved but does NOT release.
      // currentMilestone stays at 0. Timeout on an Approved milestone should revert.
      const { reactEscrow, client, escrowId } = await loadFixture(submittedWithHandlerFixture);
      await reactEscrow.connect(client).approveMilestone(escrowId, 0); // Approved, not Released
      await time.increase(ONE_WEEK + 1);
      // currentMilestone = 0, milestone 0 status = Approved → WrongMilestoneStatus
      await expect(
        reactEscrow.connect(client).checkAndTriggerTimeout(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongMilestoneStatus");
    });

    it("checkAndTriggerTimeout reverts if not current milestone", async () => {
      const { reactEscrow, other, escrowId } = await loadFixture(submittedMilestoneFixture);
      await time.increase(ONE_WEEK + 1);
      // currentMilestone = 0, try to timeout milestone 1
      await expect(
        reactEscrow.connect(other).checkAndTriggerTimeout(escrowId, 1)
      ).to.be.revertedWithCustomError(reactEscrow, "NotCurrentMilestone");
    });

    it("executeTimeoutRelease (Submitted) → sends funds to freelancer", async () => {
      const { reactEscrow, other, freelancer, escrowId } = await loadFixture(submittedMilestoneFixture);
      await time.increase(ONE_WEEK + 1);
      await expect(
        reactEscrow.connect(other).executeTimeoutRelease(escrowId, 0)
      ).to.changeEtherBalance(freelancer, ethers.parseEther("1"));
    });

    it("executeTimeoutRelease (Pending, never submitted) → still releases to freelancer", async () => {
      // Deadline passed but freelancer never submitted — contract still releases
      const { reactEscrow, other, freelancer, escrowId } = await loadFixture(activeEscrowFixture);
      await time.increase(ONE_WEEK + 1);
      await expect(
        reactEscrow.connect(other).executeTimeoutRelease(escrowId, 0)
      ).to.changeEtherBalance(freelancer, ethers.parseEther("1"));
    });

    it("executeTimeoutRelease reverts before deadline", async () => {
      const { reactEscrow, other, escrowId } = await loadFixture(submittedMilestoneFixture);
      await expect(
        reactEscrow.connect(other).executeTimeoutRelease(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "DeadlineNotPassed");
    });
  });

  // ----------------------------------------------------------------
  describe("Dispute flow", function () {
    it("client raises dispute → escrow Disputed, milestone Disputed", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(submittedMilestoneFixture);
      await expect(reactEscrow.connect(client).raiseDispute(escrowId, 0))
        .to.emit(reactEscrow, "DisputeRaised").withArgs(escrowId, 0n, client.address);
      const [, , , , escrowStatus] = await reactEscrow.getEscrow(escrowId);
      expect(escrowStatus).to.equal(4n); // Disputed
      const ms = await reactEscrow.getMilestones(escrowId);
      expect(ms[0].status).to.equal(3n); // Disputed
    });

    it("freelancer can also raise dispute", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(submittedMilestoneFixture);
      await expect(reactEscrow.connect(freelancer).raiseDispute(escrowId, 0))
        .to.emit(reactEscrow, "DisputeRaised").withArgs(escrowId, 0n, freelancer.address);
    });

    it("third party cannot raise dispute", async () => {
      const { reactEscrow, other, escrowId } = await loadFixture(submittedMilestoneFixture);
      await expect(
        reactEscrow.connect(other).raiseDispute(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "NotAuthorized");
    });

    it("reverts if escrow not Active", async () => {
      // Put escrow in Disputed first, then try again
      const { reactEscrow, client, escrowId } = await loadFixture(submittedMilestoneFixture);
      await reactEscrow.connect(client).raiseDispute(escrowId, 0);
      await expect(
        reactEscrow.connect(client).raiseDispute(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongStatus");
    });

    it("arbiter resolves → release to freelancer (resolution=0)", async () => {
      const { reactEscrow, client, freelancer, arbiter, escrowId } =
        await loadFixture(submittedMilestoneFixture);
      await reactEscrow.connect(client).raiseDispute(escrowId, 0);

      const tx = reactEscrow.connect(arbiter).resolveDispute(escrowId, 0, 0);
      await expect(tx)
        .to.emit(reactEscrow, "DisputeResolved").withArgs(escrowId, 0n, 0n)
        .and.to.emit(reactEscrow, "FundsReleased").withArgs(escrowId, 0n, freelancer.address, ethers.parseEther("1"));
      await expect(tx).to.changeEtherBalance(freelancer, ethers.parseEther("1"));
    });

    it("arbiter resolves → refund to client (resolution=1)", async () => {
      const { reactEscrow, client, arbiter, escrowId } = await loadFixture(submittedMilestoneFixture);
      await reactEscrow.connect(client).raiseDispute(escrowId, 0);

      const tx = reactEscrow.connect(arbiter).resolveDispute(escrowId, 0, 1);
      await expect(tx).to.emit(reactEscrow, "FundsReleased").withArgs(
        escrowId, 0n, client.address, ethers.parseEther("1")
      );
      await expect(tx).to.changeEtherBalance(client, ethers.parseEther("1"));
    });

    it("arbiter resolves → 50/50 split (resolution=2)", async () => {
      const { reactEscrow, client, freelancer, arbiter, escrowId } =
        await loadFixture(submittedMilestoneFixture);
      await reactEscrow.connect(client).raiseDispute(escrowId, 0);

      const tx = reactEscrow.connect(arbiter).resolveDispute(escrowId, 0, 2);
      // 1 ETH split: freelancer gets half (0.5 ETH), client gets remainder (0.5 ETH)
      await expect(tx).to.changeEtherBalances(
        [freelancer, client],
        [ethers.parseEther("0.5"), ethers.parseEther("0.5")]
      );
    });

    it("reverts if not arbiter tries to resolve", async () => {
      const { reactEscrow, client, other, escrowId } = await loadFixture(submittedMilestoneFixture);
      await reactEscrow.connect(client).raiseDispute(escrowId, 0);
      await expect(
        reactEscrow.connect(other).resolveDispute(escrowId, 0, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "NotArbiter");
    });

    it("reverts if resolution > 2", async () => {
      const { reactEscrow, client, arbiter, escrowId } = await loadFixture(submittedMilestoneFixture);
      await reactEscrow.connect(client).raiseDispute(escrowId, 0);
      await expect(
        reactEscrow.connect(arbiter).resolveDispute(escrowId, 0, 3)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongStatus");
    });

    it("escrow returns to Active after resolution (remaining milestones still workable)", async () => {
      const { reactEscrow, client, freelancer, arbiter, escrowId } =
        await loadFixture(submittedMilestoneFixture);
      await reactEscrow.connect(client).raiseDispute(escrowId, 0);
      await reactEscrow.connect(arbiter).resolveDispute(escrowId, 0, 0); // release to freelancer

      const [, , , , status, currentMs] = await reactEscrow.getEscrow(escrowId);
      expect(status).to.equal(2n); // Active again
      expect(currentMs).to.equal(1n); // advanced to milestone 1
    });

    it("executeResolutionDistribution called directly by arbiter (handler fallback)", async () => {
      // With handler set, resolveDispute does NOT auto-distribute
      const { reactEscrow, client, freelancer, arbiter, escrowId } =
        await loadFixture(submittedWithHandlerFixture);
      await reactEscrow.connect(client).raiseDispute(escrowId, 0);
      await reactEscrow.connect(arbiter).resolveDispute(escrowId, 0, 0); // resolution stored, no distribute

      // Milestone still Disputed (handler hasn't run yet)
      const msBefore = await reactEscrow.getMilestones(escrowId);
      expect(msBefore[0].status).to.equal(3n); // Disputed

      // Arbiter can call directly as fallback
      await expect(
        reactEscrow.connect(arbiter).executeResolutionDistribution(escrowId, 0)
      ).to.changeEtherBalance(freelancer, ethers.parseEther("1"));
    });

    it("executeResolutionDistribution reverts for non-authorized caller", async () => {
      const { reactEscrow, client, arbiter, other, escrowId } =
        await loadFixture(submittedWithHandlerFixture);
      await reactEscrow.connect(client).raiseDispute(escrowId, 0);
      await reactEscrow.connect(arbiter).resolveDispute(escrowId, 0, 0);
      await expect(
        reactEscrow.connect(other).executeResolutionDistribution(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "NotAuthorized");
    });
  });

  // ----------------------------------------------------------------
  describe("Multi-milestone complete flow", function () {
    it("completes escrow after both milestones released, emits EscrowCompleted", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(activeEscrowFixture);

      // Milestone 0: submit → approve → auto-release
      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      await reactEscrow.connect(client).approveMilestone(escrowId, 0);

      // After milestone 0, current = 1
      const [, , , , statusMid, currentMid] = await reactEscrow.getEscrow(escrowId);
      expect(statusMid).to.equal(2n); // still Active
      expect(currentMid).to.equal(1n);

      // Milestone 1: submit → approve → auto-release → EscrowCompleted
      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 1);
      await expect(reactEscrow.connect(client).approveMilestone(escrowId, 1))
        .to.emit(reactEscrow, "EscrowCompleted").withArgs(escrowId);

      const [, , , , statusFinal] = await reactEscrow.getEscrow(escrowId);
      expect(statusFinal).to.equal(3n); // Completed
    });

    it("freelancer receives both milestone amounts", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(activeEscrowFixture);

      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      const tx0 = reactEscrow.connect(client).approveMilestone(escrowId, 0);
      await expect(tx0).to.changeEtherBalance(freelancer, ethers.parseEther("1"));

      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 1);
      const tx1 = reactEscrow.connect(client).approveMilestone(escrowId, 1);
      await expect(tx1).to.changeEtherBalance(freelancer, ethers.parseEther("2"));
    });

    it("cannot submit milestone after escrow completed", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(activeEscrowFixture);

      // Complete escrow
      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      await reactEscrow.connect(client).approveMilestone(escrowId, 0);
      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 1);
      await reactEscrow.connect(client).approveMilestone(escrowId, 1);

      // Escrow is Completed — freelancer tries to submit again
      // currentMilestone = 2, which is out of bounds — should revert
      await expect(
        reactEscrow.connect(freelancer).submitMilestone(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongStatus");
    });
  });

  // ----------------------------------------------------------------
  describe("ReactiveHandlers", function () {
    it("topic constants match event signature hashes", async () => {
      const { handlers } = await loadFixture(deployFixture);
      expect(await handlers.MILESTONE_APPROVED_TOPIC()).to.equal(
        ethers.id("MilestoneApproved(uint256,uint256,uint256)")
      );
      expect(await handlers.DEADLINE_REACHED_TOPIC()).to.equal(
        ethers.id("DeadlineReached(uint256,uint256)")
      );
      expect(await handlers.DISPUTE_RESOLVED_TOPIC()).to.equal(
        ethers.id("DisputeResolved(uint256,uint256,uint8)")
      );
    });

    it("reactEscrow address stored correctly in handlers", async () => {
      const { reactEscrow, handlers } = await loadFixture(deployFixture);
      expect(await handlers.reactEscrow()).to.equal(await reactEscrow.getAddress());
    });

    it("reverts if caller is not precompile (0x0100)", async () => {
      const { handlers, reactEscrow, other } = await loadFixture(deployFixture);
      const { topics, data } = encodeMilestoneApproved(1n, 0n, ethers.parseEther("1"));
      await expect(
        handlers.connect(other).onEvent(await reactEscrow.getAddress(), topics, data)
      ).to.be.revertedWithCustomError(handlers, "OnlyReactivityPrecompile");
    });

    it("MilestoneApproved: precompile triggers handler → releases funds to freelancer", async () => {
      const { reactEscrow, handlers, client, freelancer, escrowId, milestones } =
        await loadFixture(submittedWithHandlerFixture);

      // Client approves (no auto-release since handler is set)
      await reactEscrow.connect(client).approveMilestone(escrowId, 0);

      // Precompile invokes handler with MilestoneApproved event data
      const precompile = await impersonatePrecompile();
      const { topics, data } = encodeMilestoneApproved(escrowId, 0n, milestones[0].amount);

      await expect(
        handlers.connect(precompile).onEvent(await reactEscrow.getAddress(), topics, data)
      ).to.changeEtherBalance(freelancer, milestones[0].amount);

      // Verify milestone released
      const ms = await reactEscrow.getMilestones(escrowId);
      expect(ms[0].status).to.equal(4n); // Released

      await stopImpersonation();
    });

    it("MilestoneApproved: handler emits HandlerInvoked(topic, escrowId, success=true)", async () => {
      const { reactEscrow, handlers, client, escrowId, milestones } =
        await loadFixture(submittedWithHandlerFixture);

      await reactEscrow.connect(client).approveMilestone(escrowId, 0);

      const precompile = await impersonatePrecompile();
      const { topics, data } = encodeMilestoneApproved(escrowId, 0n, milestones[0].amount);

      await expect(
        handlers.connect(precompile).onEvent(await reactEscrow.getAddress(), topics, data)
      )
        .to.emit(handlers, "HandlerInvoked")
        .withArgs(ethers.id("MilestoneApproved(uint256,uint256,uint256)"), escrowId, true);

      await stopImpersonation();
    });

    it("DeadlineReached: precompile triggers handler → auto timeout release", async () => {
      const { reactEscrow, handlers, freelancer, escrowId } =
        await loadFixture(submittedWithHandlerFixture);

      // Advance past milestone 0 deadline
      await time.increase(ONE_WEEK + 1);

      const precompile = await impersonatePrecompile();
      const { topics, data } = encodeDeadlineReached(escrowId, 0n);

      await expect(
        handlers.connect(precompile).onEvent(await reactEscrow.getAddress(), topics, data)
      ).to.changeEtherBalance(freelancer, ethers.parseEther("1"));

      await stopImpersonation();
    });

    it("DisputeResolved: precompile triggers handler → distributes per resolution", async () => {
      const { reactEscrow, handlers, client, freelancer, arbiter, escrowId } =
        await loadFixture(submittedWithHandlerFixture);

      // Raise dispute, then resolve (handler set → no auto-distribute)
      await reactEscrow.connect(client).raiseDispute(escrowId, 0);
      await reactEscrow.connect(arbiter).resolveDispute(escrowId, 0, 0); // release to freelancer

      // Milestone is still Disputed (handler hasn't run yet)
      const msBefore = await reactEscrow.getMilestones(escrowId);
      expect(msBefore[0].status).to.equal(3n); // Disputed

      const precompile = await impersonatePrecompile();
      const { topics, data } = encodeDisputeResolved(escrowId, 0n, 0);

      await expect(
        handlers.connect(precompile).onEvent(await reactEscrow.getAddress(), topics, data)
      ).to.changeEtherBalance(freelancer, ethers.parseEther("1"));

      await stopImpersonation();
    });

    it("ignores events from wrong emitter (no revert, no action)", async () => {
      const { handlers, other } = await loadFixture(deployFixture);
      const precompile = await impersonatePrecompile();
      const { topics, data } = encodeMilestoneApproved(1n, 0n, ethers.parseEther("1"));

      // Pass other.address as emitter instead of reactEscrow
      await expect(
        handlers.connect(precompile).onEvent(other.address, topics, data)
      ).to.not.be.reverted;

      await stopImpersonation();
    });

    it("ignores unknown event topics (no revert, no action)", async () => {
      const { handlers, reactEscrow } = await loadFixture(deployFixture);
      const precompile = await impersonatePrecompile();
      const unknownTopic = ethers.id("SomeUnknownEvent(uint256)");
      const data = abiCoder.encode(["uint256"], [0n]);

      await expect(
        handlers
          .connect(precompile)
          .onEvent(await reactEscrow.getAddress(), [unknownTopic], data)
      ).to.not.be.reverted;

      await stopImpersonation();
    });

    it("handles empty topics array gracefully (no revert)", async () => {
      const { handlers, reactEscrow } = await loadFixture(deployFixture);
      const precompile = await impersonatePrecompile();

      await expect(
        handlers.connect(precompile).onEvent(await reactEscrow.getAddress(), [], "0x")
      ).to.not.be.reverted;

      await stopImpersonation();
    });

    it("accepts STT funding via receive()", async () => {
      const { handlers, owner } = await loadFixture(deployFixture);
      await expect(
        owner.sendTransaction({ to: await handlers.getAddress(), value: ethers.parseEther("32") })
      ).to.not.be.reverted;
      expect(await handlers.getBalance()).to.equal(ethers.parseEther("32"));
    });

    it("owner can withdraw from handler", async () => {
      const { handlers, owner } = await loadFixture(deployFixture);
      await owner.sendTransaction({ to: await handlers.getAddress(), value: ethers.parseEther("1") });

      await expect(
        handlers.connect(owner).withdraw(ethers.parseEther("1"))
      ).to.changeEtherBalance(owner, ethers.parseEther("1"));
    });
  });
});
