// Locked plan tiers. `multiplier` is the TOTAL return multiple paid out at maturity
// (e.g. Painite: lock $100 for 100 days -> $500 total back = $400 profit).
// Rewards accrue continuously and linearly toward that multiple; principal is
// returned separately on unlock.
const PLANS = {
  gold:    { key: 'gold',    name: 'Gold',    days: 30,  multiplier: 1.4 },
  diamond: { key: 'diamond', name: 'Diamond', days: 50,  multiplier: 2 },
  ruby:    { key: 'ruby',    name: 'Ruby',    days: 70,  multiplier: 3.2 },
  painite: { key: 'painite', name: 'Painite', days: 100, multiplier: 5 },
};

const MIN_LOCK_USD = 500;

// Demo deposit destinations shown to the user when funding. Not real wallets —
// replace with real addresses before going anywhere near production.
const DEPOSIT_ADDRESSES = {
  usdt: {
    trc20: 'TDemoUSDTTRC20xxxxxxxxxxxxxxxxxxAB12',
    erc20: '0xDemoUSDTERC20xxxxxxxxxxxxxxxxxxxxAB12',
    bep20: '0xDemoUSDTBEP20xxxxxxxxxxxxxxxxxxxxAB12',
  },
  btc: {
    default: 'bc1qDemoBTCAddressxxxxxxxxxxxxxxxxxAB12',
  },
};

module.exports = { PLANS, MIN_LOCK_USD, DEPOSIT_ADDRESSES };
