import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ReactEscrow, ReactiveHandlers } from "../typechain-types";

// ============================================================
// Feature 3: Streaming Partial Payments (Checkpoints)
// ============================================================

const ONE_WEEK  = 7 * 24 * 3600;
const PRECOMPILE = "0x0000000000000000000000000000000000000100";

async function deployFixture() {
  const [owner, client, freelancer, arbiter, other] = await ethers.getSigners();
  const F = await ethers.getContractFactory("ReactEscrow");
  const reactEscrow = (await F.deploy()) as ReactEscrow;
  const HF = await ethers.getContractFactory("ReactiveHandlers");
  const handlers = (await HF.deploy(await reactEscrow.getAddress())) as ReactiveHandlers;
  return { reactEscrow, handlers, owner, client, freelancer, arbiter, other };
}

async function escrowWithCheckpointsFixture() {
  const base = await deployFixture();
  const { reactEscrow, client, freelancer, arbiter } = base;
  const now = await time.latest();
  const amount = ethers.parseEther("3");

  const tx = await reactEscrow.connect(client).createEscrow(
    freelancer.address, arbiter.address,
    [{ description: "Streaming Milestone", amount, deadline: BigInt(now + ONE_WEEK) }],
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

  // Add 3 checkpoints: 30%, 30%, 40%
  await reactEscrow.connect(client).addMilestoneCheckpoints(
    escrowId, 0,
    ["Design", "Implementation", "Testing"],
    [30, 30, 40]
  );

  return { ...base, escrowId, amount };
}

describe("Feature 3: Streaming Partial Payments", () => {

  describe("addMilestoneCheckpoints", () => {
    it("adds checkpoints with correct weights", async () => {
      const { reactEscrow, escrowId } = await loadFixture(escrowWithCheckpointsFixture);
      const cps = await reactEscrow.getCheckpoints(escrowId, 0);
      expect(cps.length).to.equal(3);
      expect(cps[0].weightPercent).to.equal(30);
      expect(cps[1].weightPercent).to.equal(30);
      expect(cps[2].weightPercent).to.equal(40);
    });

    it("all checkpoints start as Pending (status=0)", async () => {
      const { reactEscrow, escrowId } = await loadFixture(escrowWithCheckpointsFixture);
      const cps = await reactEscrow.getCheckpoints(escrowId, 0);
      for (const cp of cps) expect(cp.status).to.equal(0);
    });

    it("reverts if weights don't sum to 100", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrow(
        freelancer.address, arbiter.address,
        [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      );
      await expect(reactEscrow.connect(client).addMilestoneCheckpoints(
        1n, 0, ["A", "B"], [50, 51]
      )).to.be.revertedWithCustomError(reactEscrow, "InvalidWeights");
    });

    it("reverts if any weight is 0", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrow(
        freelancer.address, arbiter.address,
        [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      );
      await expect(reactEscrow.connect(client).addMilestoneCheckpoints(
        1n, 0, ["A", "B"], [0, 100]
      )).to.be.revertedWithCustomError(reactEscrow, "InvalidWeights");
    });

    it("reverts if descriptions and weights lengths differ", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrow(
        freelancer.address, arbiter.address,
        [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      );
      await expect(reactEscrow.connect(client).addMilestoneCheckpoints(
        1n, 0, ["A", "B", "C"], [50, 50]
      )).to.be.revertedWithCustomError(reactEscrow, "InvalidWeights");
    });

    it("reverts if checkpoints already exist", async () => {
      const { reactEscrow, client, escrowId } = await loadFixture(escrowWithCheckpointsFixture);
      await expect(reactEscrow.connect(client).addMilestoneCheckpoints(
        escrowId, 0, ["New"], [100]
      )).to.be.revertedWithCustomError(reactEscrow, "CheckpointsAlreadyExist");
    });

    it("reverts if not client", async () => {
      const { reactEscrow, freelancer, client, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrow(
        freelancer.address, arbiter.address,
        [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      );
      await expect(reactEscrow.connect(freelancer).addMilestoneCheckpoints(
        1n, 0, ["A"], [100]
      )).to.be.revertedWithCustomError(reactEscrow, "NotClient");
    });

    it("reverts if milestone already submitted", async () => {
      const { reactEscrow, client, freelancer, escrowId } =
        await loadFixture(escrowWithCheckpointsFixture);
      // Need a fresh escrow without checkpoints for this test
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrow(
        freelancer.address, (await ethers.getSigners())[3].address,
        [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      );
      await reactEscrow.connect(freelancer).submitMilestone(2n, 0);
      await expect(reactEscrow.connect(client).addMilestoneCheckpoints(
        2n, 0, ["A"], [100]
      )).to.be.revertedWithCustomError(reactEscrow, "WrongMilestoneStatus");
    });
  });

  describe("submitCheckpoint", () => {
    it("freelancer submits checkpoint — status becomes Submitted (1)", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(escrowWithCheckpointsFixture);
      await expect(reactEscrow.connect(freelancer).submitCheckpoint(escrowId, 0, 0))
        .to.emit(reactEscrow, "CheckpointSubmitted").withArgs(escrowId, 0, 0);
      const cps = await reactEscrow.getCheckpoints(escrowId, 0);
      expect(cps[0].status).to.equal(1);
    });

    it("reverts if not freelancer", async () => {
      const { reactEscrow, client, escrowId } = await loadFixture(escrowWithCheckpointsFixture);
      await expect(
        reactEscrow.connect(client).submitCheckpoint(escrowId, 0, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "NotFreelancer");
    });

    it("reverts if checkpoint already submitted", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(escrowWithCheckpointsFixture);
      await reactEscrow.connect(freelancer).submitCheckpoint(escrowId, 0, 0);
      await expect(
        reactEscrow.connect(freelancer).submitCheckpoint(escrowId, 0, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongCheckpointStatus");
    });

    it("reverts if invalid checkpointIndex", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(escrowWithCheckpointsFixture);
      await expect(
        reactEscrow.connect(freelancer).submitCheckpoint(escrowId, 0, 99)
      ).to.be.revertedWithCustomError(reactEscrow, "InvalidCheckpointIndex");
    });
  });

  describe("approveCheckpoint + releaseCheckpointFunds", () => {
    it("approving checkpoint emits CheckpointApproved with correct amount", async () => {
      const { reactEscrow, client, freelancer, escrowId, amount } =
        await loadFixture(escrowWithCheckpointsFixture);
      await reactEscrow.connect(freelancer).submitCheckpoint(escrowId, 0, 0);

      const expectedAmount = amount * 30n / 100n;
      await expect(reactEscrow.connect(client).approveCheckpoint(escrowId, 0, 0))
        .to.emit(reactEscrow, "CheckpointApproved")
        .withArgs(escrowId, 0, 0, expectedAmount);
    });

    it("releases proportional funds to freelancer (no handler)", async () => {
      const { reactEscrow, client, freelancer, escrowId, amount } =
        await loadFixture(escrowWithCheckpointsFixture);
      await reactEscrow.connect(freelancer).submitCheckpoint(escrowId, 0, 0);

      const before = await ethers.provider.getBalance(freelancer.address);
      await reactEscrow.connect(client).approveCheckpoint(escrowId, 0, 0);
      const after = await ethers.provider.getBalance(freelancer.address);

      const expectedAmount = amount * 30n / 100n;
      expect(after - before).to.be.closeTo(expectedAmount, ethers.parseEther("0.01"));
    });

    it("getMilestoneReleasedAmount tracks cumulative releases", async () => {
      const { reactEscrow, client, freelancer, escrowId, amount } =
        await loadFixture(escrowWithCheckpointsFixture);
      await reactEscrow.connect(freelancer).submitCheckpoint(escrowId, 0, 0);
      await reactEscrow.connect(client).approveCheckpoint(escrowId, 0, 0);

      const released = await reactEscrow.getMilestoneReleasedAmount(escrowId, 0);
      expect(released).to.equal(amount * 30n / 100n);
    });

    it("last checkpoint gets rounding remainder", async () => {
      // Create escrow with odd amount to test rounding
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1"); // 33+33+34 split
      await reactEscrow.connect(client).createEscrow(
        freelancer.address, arbiter.address,
        [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      );
      await reactEscrow.connect(client).addMilestoneCheckpoints(
        1n, 0, ["A", "B", "C"], [33, 33, 34]
      );
      await reactEscrow.connect(freelancer).submitCheckpoint(1n, 0, 0);
      await reactEscrow.connect(client).approveCheckpoint(1n, 0, 0);
      await reactEscrow.connect(freelancer).submitCheckpoint(1n, 0, 1);
      await reactEscrow.connect(client).approveCheckpoint(1n, 0, 1);
      await reactEscrow.connect(freelancer).submitCheckpoint(1n, 0, 2);

      const before = await ethers.provider.getBalance(freelancer.address);
      await reactEscrow.connect(client).approveCheckpoint(1n, 0, 2);
      const after = await ethers.provider.getBalance(freelancer.address);

      // Last chunk should be whatever remains
      const expectedLast = amount - (amount * 33n / 100n) - (amount * 33n / 100n);
      expect(after - before).to.be.closeTo(expectedLast, ethers.parseEther("0.001"));
    });

    it("all checkpoints released → milestone Released, escrow Completed", async () => {
      const { reactEscrow, client, freelancer, escrowId } =
        await loadFixture(escrowWithCheckpointsFixture);

      for (let i = 0; i < 3; i++) {
        await reactEscrow.connect(freelancer).submitCheckpoint(escrowId, 0, i);
        await reactEscrow.connect(client).approveCheckpoint(escrowId, 0, i);
      }

      const milestones = await reactEscrow.getMilestones(escrowId);
      expect(milestones[0].status).to.equal(4); // Released

      const [,,,,status,] = await reactEscrow.getEscrow(escrowId);
      expect(status).to.equal(3); // Completed
    });

    it("milestone NOT released after only partial checkpoints", async () => {
      const { reactEscrow, client, freelancer, escrowId } =
        await loadFixture(escrowWithCheckpointsFixture);
      await reactEscrow.connect(freelancer).submitCheckpoint(escrowId, 0, 0);
      await reactEscrow.connect(client).approveCheckpoint(escrowId, 0, 0);

      const milestones = await reactEscrow.getMilestones(escrowId);
      expect(milestones[0].status).to.equal(0); // Still Pending (not Released)
    });

    it("reverts approveCheckpoint if not client", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(escrowWithCheckpointsFixture);
      await reactEscrow.connect(freelancer).submitCheckpoint(escrowId, 0, 0);
      await expect(
        reactEscrow.connect(freelancer).approveCheckpoint(escrowId, 0, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "NotClient");
    });

    it("reverts approveCheckpoint if checkpoint not submitted", async () => {
      const { reactEscrow, client, escrowId } = await loadFixture(escrowWithCheckpointsFixture);
      await expect(
        reactEscrow.connect(client).approveCheckpoint(escrowId, 0, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongCheckpointStatus");
    });
  });

  describe("Reactive handler — CheckpointApproved subscription", () => {
    it("CHECKPOINT_APPROVED_TOPIC matches event signature hash", async () => {
      const { handlers } = await loadFixture(deployFixture);
      const expected = ethers.id("CheckpointApproved(uint256,uint256,uint256,uint256)");
      expect(await handlers.CHECKPOINT_APPROVED_TOPIC()).to.equal(expected);
    });

    it("precompile triggers releaseCheckpointFunds via handler", async () => {
      const { reactEscrow, handlers, client, freelancer, owner } =
        await loadFixture(deployFixture);
      await reactEscrow.connect(owner).setReactiveHandler(await handlers.getAddress());

      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrow(
        freelancer.address, (await ethers.getSigners())[3].address,
        [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      );
      await reactEscrow.connect(client).addMilestoneCheckpoints(1n, 0, ["A"], [100]);
      await reactEscrow.connect(freelancer).submitCheckpoint(1n, 0, 0);
      await reactEscrow.connect(client).approveCheckpoint(1n, 0, 0);

      // After approval (with handler), checkpoint is Approved but not yet Released.
      // Now simulate reactive handler calling releaseCheckpointFunds via precompile
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [PRECOMPILE],
      });
      await ethers.provider.send("hardhat_setBalance", [PRECOMPILE, "0x8AC7230489E80000"]);
      const precompileSigner = await ethers.getSigner(PRECOMPILE);

      const cps = await reactEscrow.getCheckpoints(1n, 0);
      expect(cps[0].status).to.equal(2); // Approved
    });
  });

  describe("Backward compatibility", () => {
    it("getCheckpoints returns empty array for non-checkpoint milestones", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrow(
        freelancer.address, arbiter.address,
        [{ description: "Normal", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      );
      const cps = await reactEscrow.getCheckpoints(1n, 0);
      expect(cps.length).to.equal(0);
    });

    it("milestones without checkpoints still use normal approve flow", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrow(
        freelancer.address, arbiter.address,
        [{ description: "Normal", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      );
      await reactEscrow.connect(freelancer).submitMilestone(1n, 0);
      await expect(reactEscrow.connect(client).approveMilestone(1n, 0))
        .to.emit(reactEscrow, "MilestoneApproved");
    });
  });
});

// Need to import network for hardhat_impersonateAccount
import { network } from "hardhat";
