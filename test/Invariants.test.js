// Tests "fuzz" / invariants en Hardhat : on execute une longue suite d'actions ALEATOIRES (graine fixe,
// donc reproductible) et on verifie apres CHAQUE action des proprietes qui doivent toujours etre vraies.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { cdf, eth, usd8, deploySystem } = require("./helpers");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function runCampaign(seed, steps) {
  const rnd = mulberry32(seed);
  const { vault, token, feed, admin, alice, bob, carol, liquidator, other } = await deploySystem();
  const users = [alice, bob, carol, other];
  const vaultAddr = await vault.getAddress();
  const everyone = [...users, liquidator];

  // Le liquidateur dispose d'un gros coffre pour obtenir des CDFx
  await vault.connect(liquidator).depositAndMint(cdf(40_000_000), { value: eth(30) });
  for (const s of everyone) await token.connect(s).approve(vaultAddr, ethers.MaxUint256);

  const stats = { deposit: 0, mint: 0, repay: 0, withdraw: 0, liquidate: 0, price: 0, time: 0, rejected: 0 };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const frac = (x, p) => (x * BigInt(Math.max(1, Math.floor(p * 1000)))) / 1000n;

  async function checkInvariants(label) {
    await vault.drip(); // materialise les frais courus avant de comparer l'offre et la dette
    // I1 : l'ETH detenu par le contrat couvre exactement le collateral enregistre
    expect(await ethers.provider.getBalance(vaultAddr), `I1 ${label}`).to.equal(await vault.totalCollateral());
    // I2 : la somme des collaterals individuels = collateral total
    let sumColl = 0n;
    let sumDebt = 0n;
    for (const s of everyone) {
      sumColl += await vault.collateralOf(s.address);
      sumDebt += await vault.debtOf(s.address);
    }
    expect(sumColl, `I2 ${label}`).to.equal(await vault.totalCollateral());
    // I3 : l'offre de CDFx est egale a la dette totale (a quelques wei d'arrondi pres)
    const supply = await token.totalSupply();
    const total = await vault.totalDebt();
    const gap = supply >= total ? supply - total : total - supply;
    expect(gap < 10_000n, `I3 ${label}: ecart ${gap}`).to.equal(true);
    // I4 : la somme des dettes individuelles + dette irrecouvrable ne depasse pas la dette totale (arrondis pres)
    expect(sumDebt <= total - (await vault.badDebt()) + 20n, `I4 ${label}`).to.equal(true);
  }

  for (let i = 0; i < steps; i++) {
    const action = rnd();
    const u = pick(users);
    try {
      if (action < 0.2) {
        await vault.connect(u).depositCollateral({ value: eth((0.1 + rnd() * 3).toFixed(4)) });
        stats.deposit++;
      } else if (action < 0.42) {
        const max = await vault.maxMintable(u.address);
        if (max > cdf(10_000)) {
          await vault.connect(u).mint(frac(max, 0.2 + rnd() * 0.8));
          const ratio = await vault.collateralRatioBps(u.address);
          expect(ratio >= 15_000n, "ratio apres emission >= 150 %").to.equal(true);
          stats.mint++;
        }
      } else if (action < 0.58) {
        const debt = await vault.debtOf(u.address);
        if (debt > 0n) {
          const bal = await token.balanceOf(u.address);
          const amount = frac(debt, rnd());
          await vault.connect(u).repay(amount < bal ? amount : bal);
          stats.repay++;
        }
      } else if (action < 0.7) {
        const max = await vault.maxWithdrawable(u.address);
        if (max > 0n) {
          await vault.connect(u).withdrawCollateral(frac(max, rnd()));
          const debt = await vault.debtOf(u.address);
          if (debt > 0n) {
            expect((await vault.collateralRatioBps(u.address)) >= 15_000n, "ratio apres retrait >= 150 %").to.equal(true);
          }
          stats.withdraw++;
        }
      } else if (action < 0.82) {
        for (const v of users) {
          if (await vault.isLiquidatable(v.address)) {
            const debt = await vault.debtOf(v.address);
            await vault.connect(liquidator).liquidate(v.address, frac(debt, 0.3 + rnd() * 0.7));
            stats.liquidate++;
            break;
          }
        }
      } else if (action < 0.94) {
        await feed.setAnswer(usd8(1100 + Math.floor(rnd() * 3600))); // ETH entre 1 100 et 4 700 USD
        stats.price++;
      } else {
        await time.increase(Math.floor(rnd() * 20 * 24 * 3600));
        await feed.setAnswer(await feed.answer()); // le flux reste "frais"
        stats.time++;
      }
    } catch (e) {
      if (e.code === "ERR_ASSERTION" || /AssertionError/.test(e.name || "")) throw e; // une invariante violee n'est pas un revert metier
      stats.rejected++;
    }
    await checkInvariants(`seed ${seed} etape ${i}`);
  }
  return stats;
}

describe("Fuzz / invariants (suites d'actions aleatoires reproductibles)", function () {
  this.timeout(600_000);
  for (const seed of [1, 7, 42]) {
    it(`graine ${seed} : 250 actions, invariants verifies apres chacune`, async () => {
      const stats = await runCampaign(seed, 250);
      console.log("      actions executees :", JSON.stringify(stats));
      expect(stats.deposit + stats.mint + stats.repay + stats.withdraw).to.be.gt(40);
    });
  }
});
