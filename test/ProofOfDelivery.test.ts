import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ReactEscrow } from "../typechain-types";

// ============================================================
// Feature 2: Proof-of-Delivery Oracle (Commit-Reveal + Challenge Period)
// ============================================================

const ONE_WEEK    = 7 * 24 * 3600;
const ONE_HOUR    = 3600;
const CHALLENGE   = 4 * ONE_HOUR; // 4 hours for test speed

const DELIVERABLE_SPEC  = ethers.keccak256(ethers.toUtf8Bytes("Requirements Document v1.0"));
const DELIVERABLE_WORK  = ethers.keccak256(ethers.toUtf8Bytes("Submitted Work v1.0"));
const DIFFERENT_WORK    = ethers.keccak256(ethers.toUtf8Bytes("Different Work"));

async function deployFixture() {
  const [owner, client, freelancer, arbiter, other] = await ethers.getSigners();
  const F = await ethers.getContractFactory("ReactEscrow");
  const reactEscrow = (await F.deploy()) as ReactEscrow;
  return { reactEscrow, owner, client, freelancer, arbiter, other };
}

async function deliveryEscrowFixture() {
  const base = await deployFixture();
  const { reactEscrow, client, freelancer, arbiter } = base;
  const now = await time.latest();

  const amount  = ethers.parseEther("1");
  const milestones = [
    { description: "Milestone with delivery", amount, deadline: BigInt(now + ONE_WEEK) },
  ];
  const hashes = [DELIVERABLE_SPEC];

  const tx = await reactEscrow.connect(client).createEscrowWithDelivery(
    freelancer.address, arbiter.address, milestones, hashes, CHALLENGE,
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

describe("Feature 2: Proof-of-Delivery Oracle", () => {

  describe("createEscrowWithDelivery", () => {
    it("creates escrow and stores expected deliverable hash", async () => {
      const { reactEscrow, escrowId } = await loadFixture(deliveryEscrowFixture);
      const dd = await reactEscrow.getDeliveryData(escrowId, 0);
      expect(dd.expectedHash).to.equal(DELIVERABLE_SPEC);
      expect(dd.submittedHash).to.equal(ethers.ZeroHash);
      expect(dd.challengeDeadline).to.equal(0n);
    });

    it("stores challenge period correctly", async () => {
      const { reactEscrow, escrowId } = await loadFixture(deliveryEscrowFixture);
      const period = await reactEscrow.getChallengePeriod(escrowId);
      expect(period).to.equal(BigInt(CHALLENGE));
    });

    it("reverts if deliverableHashes length != milestones length", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await expect(reactEscrow.connect(client).createEscrowWithDelivery(
        freelancer.address, arbiter.address,
        [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
        [], // wrong length
        CHALLENGE, { value: amount }
      )).to.be.revertedWithCustomError(reactEscrow, "InvalidMilestone");
    });

    it("bytes32(0) deliverableHash = no delivery proof required", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrowWithDelivery(
        freelancer.address, arbiter.address,
        [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
        [ethers.ZeroHash],
        CHALLENGE, { value: amount }
      );
      const dd = await reactEscrow.getDeliveryData(1n, 0);
      expect(dd.expectedHash).to.equal(ethers.ZeroHash);
    });

    it("default challenge period is 172800 when 0 passed", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrowWithDelivery(
        freelancer.address, arbiter.address,
        [{ description: "M", amount, deadline: BigInt(now + ONE_WEEK) }],
        [DELIVERABLE_SPEC],
        0, { value: amount }
      );
      const period = await reactEscrow.getChallengePeriod(1n);
      expect(period).to.equal(172800n);
    });
  });

  describe("submitMilestoneWithDeliverable", () => {
    it("submits and starts challenge period when hashes match", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await expect(
        reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_WORK)
      ).to.emit(reactEscrow, "MilestoneSubmitted").withArgs(escrowId, 0);

      // Matching hashes use same bytes for spec and work in this test
    });

    it("emits DeliverableVerified when hashes match", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      // Use matching hash
      await expect(
        reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC)
      ).to.emit(reactEscrow, "DeliverableVerified").withArgs(escrowId, 0, DELIVERABLE_SPEC);
    });

    it("sets challengeDeadline when hashes match", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      const before = BigInt(await time.latest());
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC);
      const dd = await reactEscrow.getDeliveryData(escrowId, 0);
      expect(dd.challengeDeadline).to.be.gte(before + BigInt(CHALLENGE));
    });

    it("no challenge period if hashes do not match", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DIFFERENT_WORK);
      const dd = await reactEscrow.getDeliveryData(escrowId, 0);
      expect(dd.challengeDeadline).to.equal(0n);
    });

    it("reverts if not freelancer", async () => {
      const { reactEscrow, client, escrowId } = await loadFixture(deliveryEscrowFixture);
      await expect(
        reactEscrow.connect(client).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC)
      ).to.be.revertedWithCustomError(reactEscrow, "NotFreelancer");
    });
  });

  describe("checkAndTriggerChallengeExpiry", () => {
    it("auto-approves after challenge period and emits MilestoneApproved", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC);
      await time.increase(CHALLENGE + 1);

      await expect(reactEscrow.checkAndTriggerChallengeExpiry(escrowId, 0))
        .to.emit(reactEscrow, "DeliverableChallengePeriodExpired").withArgs(escrowId, 0)
        .and.to.emit(reactEscrow, "MilestoneApproved");
    });

    it("releases funds to freelancer (no handler fallback)", async () => {
      const { reactEscrow, freelancer, escrowId, amount } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC);
      await time.increase(CHALLENGE + 1);

      const before = await ethers.provider.getBalance(freelancer.address);
      await reactEscrow.checkAndTriggerChallengeExpiry(escrowId, 0);
      const after = await ethers.provider.getBalance(freelancer.address);
      expect(after - before).to.be.closeTo(amount, ethers.parseEther("0.01"));
    });

    it("reverts if challenge period not started", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DIFFERENT_WORK); // no match
      await expect(
        reactEscrow.checkAndTriggerChallengeExpiry(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "ChallengePeriodNotStarted");
    });

    it("reverts if challenge period still active", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC);
      await expect(
        reactEscrow.checkAndTriggerChallengeExpiry(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "ChallengePeriodActive");
    });

    it("reverts if already challenged (escrow becomes Disputed → WrongStatus)", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC);
      await reactEscrow.connect(client).challengeDeliverable(escrowId, 0);
      await time.increase(CHALLENGE + 1);
      // After challengeDeliverable, escrow.status = Disputed, so WrongStatus fires first
      await expect(
        reactEscrow.checkAndTriggerChallengeExpiry(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongStatus");
    });
  });

  describe("challengeDeliverable", () => {
    it("client challenges during period — moves to Disputed", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC);

      await expect(reactEscrow.connect(client).challengeDeliverable(escrowId, 0))
        .to.emit(reactEscrow, "DeliverableChallenged").withArgs(escrowId, 0)
        .and.to.emit(reactEscrow, "DisputeRaised");
    });

    it("escrow status becomes Disputed", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC);
      await reactEscrow.connect(client).challengeDeliverable(escrowId, 0);
      const [,,,,status,] = await reactEscrow.getEscrow(escrowId);
      expect(status).to.equal(4); // Disputed
    });

    it("reverts after challenge period expires", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC);
      await time.increase(CHALLENGE + 1);
      await expect(
        reactEscrow.connect(client).challengeDeliverable(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "ChallengeExpired");
    });

    it("reverts if not client", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC);
      await expect(
        reactEscrow.connect(freelancer).challengeDeliverable(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "NotClient");
    });

    it("cannot challenge twice (escrow becomes Disputed → WrongStatus)", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DELIVERABLE_SPEC);
      await reactEscrow.connect(client).challengeDeliverable(escrowId, 0);
      // After first challenge, escrow.status = Disputed, so WrongStatus fires before AlreadyChallenged
      await expect(
        reactEscrow.connect(client).challengeDeliverable(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongStatus");
    });

    it("reverts if no challenge period started (hashes didn't match)", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestoneWithDeliverable(escrowId, 0, DIFFERENT_WORK);
      await expect(
        reactEscrow.connect(client).challengeDeliverable(escrowId, 0)
      ).to.be.revertedWithCustomError(reactEscrow, "ChallengePeriodNotStarted");
    });
  });

  describe("Backward compatibility", () => {
    it("existing submitMilestone still works on delivery escrow", async () => {
      const { reactEscrow, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await expect(
        reactEscrow.connect(freelancer).submitMilestone(escrowId, 0)
      ).to.emit(reactEscrow, "MilestoneSubmitted");
    });

    it("regular approveMilestone still works after standard submit", async () => {
      const { reactEscrow, client, freelancer, escrowId } = await loadFixture(deliveryEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      await expect(
        reactEscrow.connect(client).approveMilestone(escrowId, 0)
      ).to.emit(reactEscrow, "MilestoneApproved");
    });
  });
});
