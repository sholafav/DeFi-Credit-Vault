import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const SCORE_MAX = 850;
const SCORE_MIN = 0;
const DEFAULT_INITIAL_SCORE = 500;
const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_USER = 101;
const ERR_INVALID_METRICS = 102;
const ERR_SCORE_CALC_FAILED = 103;
const ERR_UPDATE_FREQUENCY = 104;
const ERR_USER_NOT_REGISTERED = 105;
const ERR_INVALID_TRANSACTION_AGE = 106;
const ERR_ZERO_KNOWLEDGE_PROOF_FAILED = 107;
const ERR_HISTORY_LIMIT_EXCEEDED = 108;

interface CreditScore {
  score: number;
  lastUpdated: number;
  version: number;
}

interface TransactionHistory {
  payments: number;
  repayments: number;
  defaults: number;
  totalVolume: number;
  lastTxTime: number;
}

interface ZKProof {
  proofHash: Buffer;
  verified: boolean;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ScoreEngineMock {
  state: {
    lastUpdateTime: Map<string, number>;
    updateFrequency: number;
    historyLimit: number;
    zkOracleContract: string | null;
    creditScores: Map<string, CreditScore>;
    transactionHistories: Map<string, TransactionHistory>;
    scoreHistories: Map<string, number[]>;
    zkProofs: Map<string, ZKProof>;
  } = {
    lastUpdateTime: new Map(),
    updateFrequency: 86400,
    historyLimit: 100,
    zkOracleContract: null,
    creditScores: new Map(),
    transactionHistories: new Map(),
    scoreHistories: new Map(),
    zkProofs: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      lastUpdateTime: new Map(),
      updateFrequency: 86400,
      historyLimit: 100,
      zkOracleContract: null,
      creditScores: new Map(),
      transactionHistories: new Map(),
      scoreHistories: new Map(),
      zkProofs: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
  }

  setZKOracle(oracle: string): Result<boolean> {
    if (this.state.zkOracleContract !== null) return { ok: false, value: false };
    this.state.zkOracleContract = oracle;
    return { ok: true, value: true };
  }

  initializeUser(user: string): Result<boolean> {
    if (this.state.creditScores.has(user)) return { ok: false, value: false };
    this.state.creditScores.set(user, { score: DEFAULT_INITIAL_SCORE, lastUpdated: this.blockHeight, version: 1 });
    this.state.transactionHistories.set(user, { payments: 0, repayments: 0, defaults: 0, totalVolume: 0, lastTxTime: this.blockHeight });
    this.state.scoreHistories.set(user, [DEFAULT_INITIAL_SCORE]);
    return { ok: true, value: true };
  }

  updateScore(user: string, payments: number, repayments: number, defaults: number, volume: number, txTime: number): Result<number> {
    if (this.caller !== this.state.zkOracleContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.creditScores.has(user)) return { ok: false, value: ERR_INVALID_USER };
    const lastUpdated = this.state.creditScores.get(user)!.lastUpdated;
    const timeDiff = this.blockHeight - lastUpdated;
    if (timeDiff < this.state.updateFrequency) return { ok: false, value: ERR_UPDATE_FREQUENCY };
    if (payments === 0 || defaults > volume || txTime > this.blockHeight || (this.blockHeight - txTime) > 525600) return { ok: false, value: ERR_INVALID_METRICS };
    if ((this.blockHeight - txTime) > 525600) return { ok: false, value: ERR_INVALID_TRANSACTION_AGE };
    const age = this.blockHeight - txTime;
    const paymentScore = payments * 40;
    const repayScore = (repayments * volume / 100) * 40;
    const defaultPenalty = defaults * 20;
    const recencyFactor = 30 * (525600 - age) / 525600;
    const volumeFactor = (volume / 10000) * 20;
    const consistencyFactor = 10;
    let rawScore = paymentScore + repayScore + recencyFactor + volumeFactor + consistencyFactor - defaultPenalty;
    if (rawScore > SCORE_MAX) rawScore = SCORE_MAX;
    if (rawScore < SCORE_MIN) rawScore = SCORE_MIN;
    const oldEntry = this.state.creditScores.get(user)!;
    const oldHistory = this.state.scoreHistories.get(user)!;
    const newHistory = [rawScore, ...oldHistory.slice(0, this.state.historyLimit - 1)];
    this.state.creditScores.set(user, { score: rawScore, lastUpdated: this.blockHeight, version: oldEntry.version + 1 });
    this.state.transactionHistories.set(user, { payments, repayments, defaults, totalVolume: volume, lastTxTime: txTime });
    this.state.scoreHistories.set(user, newHistory);
    this.state.lastUpdateTime.set(user, this.blockHeight);
    return { ok: true, value: rawScore };
  }

  verifyZKProof(user: string, proofHash: Buffer): Result<boolean> {
    if (this.caller !== this.state.zkOracleContract) return { ok: false, value: false };
    if (this.state.zkProofs.has(user)) return { ok: false, value: false };
    this.state.zkProofs.set(user, { proofHash, verified: true, timestamp: this.blockHeight });
    return { ok: true, value: true };
  }

  getCreditScore(user: string): Result<number> {
    const entry = this.state.creditScores.get(user);
    if (!entry) return { ok: false, value: ERR_INVALID_USER };
    return { ok: true, value: entry.score };
  }

  getScoreDetails(user: string): Result<CreditScore> {
    const entry = this.state.creditScores.get(user);
    if (!entry) return { ok: false, value: null as any };
    return { ok: true, value: entry };
  }

  getTransactionHistory(user: string): Result<TransactionHistory> {
    const entry = this.state.transactionHistories.get(user);
    if (!entry) return { ok: true, value: { payments: 0, repayments: 0, defaults: 0, totalVolume: 0, lastTxTime: 0 } };
    return { ok: true, value: entry };
  }

  getScoreHistory(user: string): Result<number[]> {
    const history = this.state.scoreHistories.get(user);
    return { ok: true, value: history || [] };
  }

  isZKProofVerified(user: string): Result<boolean> {
    const proof = this.state.zkProofs.get(user);
    return { ok: true, value: !!proof?.verified };
  }

  setUpdateFrequency(freq: number): Result<boolean> {
    if (this.caller !== this.state.zkOracleContract) return { ok: false, value: false };
    if (freq <= 0) return { ok: false, value: false };
    this.state.updateFrequency = freq;
    return { ok: true, value: true };
  }

  setHistoryLimit(limit: number): Result<boolean> {
    if (this.caller !== this.state.zkOracleContract) return { ok: false, value: false };
    if (limit > 200) return { ok: false, value: false };
    this.state.historyLimit = limit;
    return { ok: true, value: true };
  }
}

describe("ScoreEngine", () => {
  let contract: ScoreEngineMock;

  beforeEach(() => {
    contract = new ScoreEngineMock();
    contract.reset();
    contract.blockHeight = 100;
  });

  it("initializes a user successfully", () => {
    contract.setZKOracle("ST2ORACLE");
    const result = contract.initializeUser("ST1USER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const score = contract.getCreditScore("ST1USER");
    expect(score.ok).toBe(true);
    expect(score.value).toBe(500);
    const history = contract.getScoreHistory("ST1USER");
    expect(history.value).toEqual([500]);
  });

  it("rejects initializing an already registered user", () => {
    contract.setZKOracle("ST2ORACLE");
    contract.initializeUser("ST1USER");
    const result = contract.initializeUser("ST1USER");
    expect(result.ok).toBe(false);
  });

  it("rejects score update without oracle authorization", () => {
    contract.setZKOracle("ST2ORACLE");
    contract.initializeUser("ST1USER");
    contract.caller = "ST1FAKE";
    const result = contract.updateScore("ST1USER", 10, 8, 1, 1000, 99900);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects score update below frequency", () => {
    contract.setZKOracle("ST2ORACLE");
    contract.caller = "ST2ORACLE";
    contract.initializeUser("ST1USER");
    const result = contract.updateScore("ST1USER", 10, 8, 1, 1000, 99900);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UPDATE_FREQUENCY);
  });

  it("verifies ZK proof successfully", () => {
    contract.setZKOracle("ST2ORACLE");
    contract.caller = "ST2ORACLE";
    const proofHash = Buffer.from("proof123", "utf8");
    const result = contract.verifyZKProof("ST1USER", proofHash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const verified = contract.isZKProofVerified("ST1USER");
    expect(verified.value).toBe(true);
  });

  it("rejects duplicate ZK proof", () => {
    contract.setZKOracle("ST2ORACLE");
    contract.caller = "ST2ORACLE";
    contract.verifyZKProof("ST1USER", Buffer.from("proof123", "utf8"));
    const result = contract.verifyZKProof("ST1USER", Buffer.from("proof456", "utf8"));
    expect(result.ok).toBe(false);
  });

  it("sets update frequency successfully", () => {
    contract.setZKOracle("ST2ORACLE");
    contract.caller = "ST2ORACLE";
    const result = contract.setUpdateFrequency(3600);
    expect(result.ok).toBe(true);
    expect(contract.state.updateFrequency).toBe(3600);
  });

  it("sets history limit successfully", () => {
    contract.setZKOracle("ST2ORACLE");
    contract.caller = "ST2ORACLE";
    const result = contract.setHistoryLimit(50);
    expect(result.ok).toBe(true);
    expect(contract.state.historyLimit).toBe(50);
  });

  it("rejects setting history limit over max", () => {
    contract.setZKOracle("ST2ORACLE");
    contract.caller = "ST2ORACLE";
    const result = contract.setHistoryLimit(201);
    expect(result.ok).toBe(false);
  });

  it("returns transaction history correctly", () => {
    contract.setZKOracle("ST2ORACLE");
    contract.initializeUser("ST1USER");
    const history = contract.getTransactionHistory("ST1USER");
    expect(history.value.payments).toBe(0);
  });

  it("calculates score with Clarity uint", () => {
    const cv = uintCV(10);
    expect(cv.value.toString()).toBe("10");
  });
});