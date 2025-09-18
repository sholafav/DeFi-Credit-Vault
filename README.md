# 📊 DeFi Credit Vault

Welcome to DeFi Credit Vault, the decentralized credit scoring platform on the Stacks blockchain! Empower users to build transparent, blockchain-verified credit scores from their on-chain transaction histories—ditching biased central banks for fair, immutable financial trust.

## ✨ Features

🔍 **On-Chain Transaction Aggregation** – Pulls and verifies payment, loan, and repayment histories automatically  
💳 **Dynamic Credit Scoring** – AI-free algorithm computes scores based on behavior, not secrets  
🛡️ **Privacy-Preserving Oracles** – Securely feeds transaction data without exposing full histories  
💰 **Integrated Lending Hooks** – Lenders query scores for instant, low-collateral loans  
⚖️ **Dispute & Appeal System** – Challenge inaccuracies with on-chain evidence  
📈 **Score History & Analytics** – Track your financial journey with verifiable timelines  
🔗 **Cross-Chain Compatibility** – Bridges scores to Ethereum/Solana via Stacks' interoperability  
🏆 **Governance Voting** – Community tunes scoring params for evolving fairness  

Powered by 8 Clarity smart contracts for rock-solid security and scalability.

## 🛠 How It Works

**For Borrowers**

1. Register your wallet in the UserRegistry contract  
2. Authorize transaction feeds via the DataAggregator—your payments, repayments, and transfers auto-sync  
3. The ScoreEngine crunches the data: +points for timely pays, - for defaults  
4. Query your score anytime with get-credit-score—boom, lender-ready proof!  

**For Lenders**

- Use the VerificationGateway to fetch anonymized scores (with user consent)  
- Integrate with LoanFactory for auto-approvals based on score thresholds  
- Settle disputes via the ResolutionHub if a borrower's history flags issues  

**Under the Hood**

- **UserRegistry**: Onboards users, manages profiles, and KYC-lite attestations  
- **DataAggregator**: Collects and timestamps transaction events from Stacks/EVM bridges  
- **ScoreEngine**: Core math contract—weights recency, volume, and consistency for scores (0-850)  
- **PrivacyOracle**: Zero-knowledge proofs hide details while proving aggregates  
- **LoanFactory**: Deploys per-loan contracts, hooks into scores for collateral calcs  
- **ResolutionHub**: Handles appeals with time-locked evidence and voter arbitration  
- **GovernanceVault**: DAO for param updates (e.g., score multipliers)  
- **AnalyticsLedger**: Immutable log of score evolutions for audits  

Deploy on Stacks testnet, connect your wallet, and start building credit that actually works for you. No more black-box FICO—your chain is your credit.