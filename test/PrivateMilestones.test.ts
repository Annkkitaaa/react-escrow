import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ReactEscrow } from "../typechain-types";

// ============================================================
// Feature 1: Privacy-Preserving Milestones (Commit-Reveal)
// ============================================================

const ONE_WEEK = 7 * 24 * 3600;

// Helper: compute commitment = keccak256(abi.encodePacked(amount, salt))
function computeCommitment(amount: bigint, salt: string): string {
  return ethers.solidityPackedKeccak256(["uint256", "bytes32"], [amount, salt]);
}

function randomSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

async function deployFixture() {
  const [owner, client, freelancer, arbiter, other] = await ethers.getSigners();
  const F = await ethers.getContractFactory("ReactEscrow");
  const reactEscrow = (await F.deploy()) as ReactEscrow;
  return { reactEscrow, owner, client, freelancer, arbiter, other };
}

async function privateEscrowFixture() {
  const base = await deployFixture();
  const { reactEscrow, client, freelancer, arbiter } = base;
  const now   = await time.latest();

  const amount0 = ethers.parseEther("1");
  const amount1 = ethers.parseEther("2");
  const salt0   = randomSalt();
  const salt1   = randomSalt();
  const commitment0 = computeCommitment(amount0, salt0);
  const commitment1 = computeCommitment(amount1, salt1);
  const total  = amount0 + amount1;

  const milestones = [
    { description: "Private Milestone 0", commitment: commitment0, deadline: BigInt(now + ONE_WEEK) },
    { description: "Private Milestone 1", commitment: commitment1, deadline: BigInt(now + 2 * ONE_WEEK) },
  ];

  const tx = await reactEscrow.connect(client).createPrivateEscrow(
    freelancer.address, arbiter.address, milestones, total, { value: total }
  );
  const receipt = await tx.wait();
  let escrowId = 1n;
  for (const log of receipt!.logs) {
    try {
      const p = reactEscrow.interface.parseLog({ data: log.data, topics: [...log.topics] });
      if (p?.name === "EscrowCreated") { escrowId = p.args.escrowId as bigint; break; }
    } catch { /* ignore */ }
  }

  return { ...base, escrowId, amount0, amount1, salt0, salt1, commitment0, commitment1, total };
}

describe("Feature 1: Privacy-Preserving Milestones", () => {

  describe("createPrivateEscrow", () => {
    it("creates escrow with commitments — amounts hidden as 0", async () => {
      const { reactEscrow, escrowId, commitment0 } = await loadFixture(privateEscrowFixture);
      const milestones = await reactEscrow.getMilestones(escrowId);
      expect(milestones[0].amount).to.equal(0n);
      expect(milestones[1].amount).to.equal(0n);
    });

    it("stores commitment and isPrivate flag correctly", async () => {
      const { reactEscrow, escrowId, commitment0, commitment1 } = await loadFixture(privateEscrowFixture);
      const [c0, priv0] = await reactEscrow.getMilestoneCommitment(escrowId, 0);
      const [c1, priv1] = await reactEscrow.getMilestoneCommitment(escrowId, 1);
      expect(c0).to.equal(commitment0);
      expect(c1).to.equal(commitment1);
      expect(priv0).to.be.true;
      expect(priv1).to.be.true;
    });

    it("totalAmount is public (deposited correctly)", async () => {
      const { reactEscrow, escrowId, total } = await loadFixture(privateEscrowFixture);
      const [,,,totalAmount,,] = await reactEscrow.getEscrow(escrowId);
      expect(totalAmount).to.equal(total);
    });

    it("escrow is Active after depositing total", async () => {
      const { reactEscrow, escrowId } = await loadFixture(privateEscrowFixture);
      const [,,,,status,] = await reactEscrow.getEscrow(escrowId);
      expect(status).to.equal(2); // Active
    });

    it("reverts if commitment is zero bytes32", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(reactEscrow.connect(client).createPrivateEscrow(
        freelancer.address, arbiter.address,
        [{ description: "Bad", commitment: ethers.ZeroHash, deadline: BigInt(now + ONE_WEEK) }],
        ethers.parseEther("1"), { value: ethers.parseEther("1") }
      )).to.be.revertedWithCustomError(reactEscrow, "InvalidCommitment");
    });

    it("reverts if freelancer == client", async () => {
      const { reactEscrow, client } = await loadFixture(deployFixture);
      const now = await time.latest();
      const salt = randomSalt();
      const commitment = computeCommitment(ethers.parseEther("1"), salt);
      await expect(reactEscrow.connect(client).createPrivateEscrow(
        client.address, client.address,
        [{ description: "Bad", commitment, deadline: BigInt(now + ONE_WEEK) }],
        ethers.parseEther("1"), { value: ethers.parseEther("1") }
      )).to.be.revertedWithCustomError(reactEscrow, "InvalidFreelancer");
    });
  });

  describe("approvePrivateMilestone — commit-reveal", () => {
    it("reveals amount and emits PrivateMilestoneRevealed + MilestoneApproved", async () => {
      const { reactEscrow, client, freelancer, escrowId, amount0, salt0 } =
        await loadFixture(privateEscrowFixture);

      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);

      await expect(
        reactEscrow.connect(client).approvePrivateMilestone(escrowId, 0, amount0, salt0)
      )
        .to.emit(reactEscrow, "PrivateMilestoneRevealed").withArgs(escrowId, 0, amount0)
        .and.to.emit(reactEscrow, "MilestoneApproved").withArgs(escrowId, 0, amount0);
    });

    it("sets milestone.amount to revealed amount", async () => {
      const { reactEscrow, client, freelancer, escrowId, amount0, salt0 } =
        await loadFixture(privateEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      await reactEscrow.connect(client).approvePrivateMilestone(escrowId, 0, amount0, salt0);
      const milestones = await reactEscrow.getMilestones(escrowId);
      expect(milestones[0].amount).to.equal(amount0);
    });

    it("auto-releases when no handler set (fallback)", async () => {
      const { reactEscrow, client, freelancer, escrowId, amount0, salt0 } =
        await loadFixture(privateEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);

      const before = await ethers.provider.getBalance(freelancer.address);
      await reactEscrow.connect(client).approvePrivateMilestone(escrowId, 0, amount0, salt0);
      const after = await ethers.provider.getBalance(freelancer.address);
      expect(after - before).to.be.closeTo(amount0, ethers.parseEther("0.01"));
    });

    it("reverts with InvalidCommitment for wrong amount", async () => {
      const { reactEscrow, client, freelancer, escrowId, salt0 } =
        await loadFixture(privateEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      const wrongAmount = ethers.parseEther("0.5");
      await expect(
        reactEscrow.connect(client).approvePrivateMilestone(escrowId, 0, wrongAmount, salt0)
      ).to.be.revertedWithCustomError(reactEscrow, "InvalidCommitment");
    });

    it("reverts with InvalidCommitment for wrong salt", async () => {
      const { reactEscrow, client, freelancer, escrowId, amount0 } =
        await loadFixture(privateEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      const wrongSalt = randomSalt();
      await expect(
        reactEscrow.connect(client).approvePrivateMilestone(escrowId, 0, amount0, wrongSalt)
      ).to.be.revertedWithCustomError(reactEscrow, "InvalidCommitment");
    });

    it("reverts if caller is not client", async () => {
      const { reactEscrow, freelancer, arbiter, escrowId, amount0, salt0 } =
        await loadFixture(privateEscrowFixture);
      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      await expect(
        reactEscrow.connect(arbiter).approvePrivateMilestone(escrowId, 0, amount0, salt0)
      ).to.be.revertedWithCustomError(reactEscrow, "NotClient");
    });

    it("reverts if milestone not submitted (Pending)", async () => {
      const { reactEscrow, client, escrowId, amount0, salt0 } =
        await loadFixture(privateEscrowFixture);
      await expect(
        reactEscrow.connect(client).approvePrivateMilestone(escrowId, 0, amount0, salt0)
      ).to.be.revertedWithCustomError(reactEscrow, "WrongMilestoneStatus");
    });

    it("reverts if milestone is not private", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      const tx = await reactEscrow.connect(client).createEscrow(
        freelancer.address, arbiter.address,
        [{ description: "Normal", amount, deadline: BigInt(now + ONE_WEEK) }],
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
      await expect(
        reactEscrow.connect(client).approvePrivateMilestone(escrowId, 0, amount, randomSalt())
      ).to.be.revertedWithCustomError(reactEscrow, "NotPrivateMilestone");
    });
  });

  describe("Full flow — private escrow end-to-end", () => {
    it("two private milestones complete, escrow status Completed", async () => {
      const { reactEscrow, client, freelancer, escrowId, amount0, amount1, salt0, salt1 } =
        await loadFixture(privateEscrowFixture);

      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 0);
      await reactEscrow.connect(client).approvePrivateMilestone(escrowId, 0, amount0, salt0);

      await reactEscrow.connect(freelancer).submitMilestone(escrowId, 1);
      await expect(
        reactEscrow.connect(client).approvePrivateMilestone(escrowId, 1, amount1, salt1)
      ).to.emit(reactEscrow, "EscrowCompleted");

      const [,,,,status,] = await reactEscrow.getEscrow(escrowId);
      expect(status).to.equal(3); // Completed
    });

    it("getMilestoneCommitment returns zero and false for non-private milestones", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await reactEscrow.connect(client).createEscrow(
        freelancer.address, arbiter.address,
        [{ description: "Normal", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      );
      const [commitment, isPrivate] = await reactEscrow.getMilestoneCommitment(1n, 0);
      expect(commitment).to.equal(ethers.ZeroHash);
      expect(isPrivate).to.be.false;
    });

    it("normal createEscrow still works — backward compatible", async () => {
      const { reactEscrow, client, freelancer, arbiter } = await loadFixture(deployFixture);
      const now = await time.latest();
      const amount = ethers.parseEther("1");
      await expect(reactEscrow.connect(client).createEscrow(
        freelancer.address, arbiter.address,
        [{ description: "Normal", amount, deadline: BigInt(now + ONE_WEEK) }],
        { value: amount }
      )).to.emit(reactEscrow, "EscrowCreated");
    });
  });
});
