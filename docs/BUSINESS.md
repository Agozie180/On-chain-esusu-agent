# Business model

## Current stage

The prototype is deployed on Portaldot V3 testnet with 12 finalized deployment/setup transactions ([proof](../README.md#testnet-deployment-proof)). Local validation comprises 110 contract/agent/service tests and 45 browser checks. The testnet demo circle has one of three members at its recorded snapshot; this is a builder-operated demonstration, not evidence of a customer pilot. Hosting, the full testnet cycle, recruited users and revenue remain outstanding.

## Who it is for
People in Nigeria who already save through esusu/ajo circles, and cooperatives or market associations that run them. EFInA's Access to Financial Services 2023 survey reports about 64% of Nigerian adults formally included, 10% informally served and 26% excluded, so informal circles remain a large share of how people save. Circles break on trust; this product replaces trust with collateral and a visible reputation.

## Revenue (all optional, all small by design)
1. **Protocol fee**: 0.5% of each payout (configurable, hard cap 2%), paid to the treasury. Taken only from payouts, never from collateral.
2. **Paid risk API**: the agent-payable HTTP 402 endpoint supports a configurable report price; the local demo charges 1 test mUSD. Commercial pricing remains a proposal, and the vault enforces owner-set caps.
3. **B2B / white-label**: cooperatives pay a subscription for hosted circles, reporting and onboarding.

## Honest unit economics
A circle of 10 members with 10,000 naira-equivalent dues makes a 100,000 pot; at 0.5% the fee is 500 per payout, 5,000 per full circle. This is thin. It only works at volume or with B2B plans, which is why grants fund the early phases. We do not claim current revenue: there are no users yet.

Portaldot testnet setup incurred about 2438.72 tPOTv3 in fees including storage deposits. Test mUSD is freely mintable and has no backing. Neither test token has a claimed cash value here, and these measurements do not establish mainnet unit economics.

## Go-to-market
1. Complete the deployed demo cycle, then recruit existing friend and family circles for a testnet pilot.
2. Partner with 2 to 3 cooperatives or market associations.
3. Reputation SDK so other dapps bring users in.

## Risks
Regulation of savings products in Nigeria, stablecoin on/off-ramp access, and smart-contract risk (mitigated by audit and deposit caps). None are solved yet.
