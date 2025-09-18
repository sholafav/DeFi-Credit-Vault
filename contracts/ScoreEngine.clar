(define-constant SCORE-MAX u850)
(define-constant SCORE-MIN u0)
(define-constant DEFAULT-INITIAL-SCORE u500)
(define-constant MAX-TRANSACTION-AGE u525600)
(define-constant PAYMENT_WEIGHT u40)
(define-constant REPAYMENT_WEIGHT u40)
(define-constant DEFAULT_PENALTY u20)
(define-constant RECENCY_WEIGHT u30)
(define-constant VOLUME_WEIGHT u20)
(define-constant CONSISTENCY_WEIGHT u10)
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-USER (err u101))
(define-constant ERR-INVALID-METRICS (err u102))
(define-constant ERR-SCORE-CALC-FAILED (err u103))
(define-constant ERR-UPDATE-FREQUENCY (err u104))
(define-constant ERR-USER-NOT-REGISTERED (err u105))
(define-constant ERR-INVALID-TRANSACTION-AGE (err u106))
(define-constant ERR-ZERO-KNOWLEDGE-PROOF-FAILED (err u107))
(define-constant ERR-HISTORY-LIMIT-EXCEEDED (err u108))

(define-data-var last-update-time principal uint)
(define-data-var update-frequency uint u86400)
(define-data-var history-limit uint u100)
(define-data-var zk-oracle-contract (optional principal) none)

(define-map credit-scores principal { score: uint, last-updated: uint, version: uint })
(define-map transaction-histories principal { payments: uint, repayments: uint, defaults: uint, total-volume: uint, last-tx-time: uint })
(define-map score-histories principal (list 50 uint))
(define-map zk-proofs principal { proof-hash: (buff 32), verified: bool, timestamp: uint })

(define-read-only (get-credit-score (user principal))
  (match (map-get? credit-scores user)
    entry (ok (get score entry))
    (err ERR-INVALID-USER)))

(define-read-only (get-score-details (user principal))
  (match (map-get? credit-scores user)
    entry (ok entry)
    (err ERR-INVALID-USER)))

(define-read-only (get-transaction-history (user principal))
  (match (map-get? transaction-histories user)
    entry (ok entry)
    { payments: u0, repayments: u0, defaults: u0, total-volume: u0, last-tx-time: u0 }))

(define-read-only (get-score-history (user principal))
  (match (map-get? score-histories user)
    history (ok history)
    (ok (list ))))

(define-read-only (is-zk-proof-verified (user principal))
  (match (map-get? zk-proofs user)
    proof (ok (get verified proof))
    (ok false)))

(define-private (validate-user-registered (user principal))
  (is-some (map-get? credit-scores user)))

(define-private (validate-metrics (payments uint) (repayments uint) (defaults uint) (volume uint) (tx-time uint))
  (and (> payments u0) (<= defaults volume) (>= tx-time u0) (<= tx-time block-height) (>= (- block-height tx-time) u0) (<= (- block-height tx-time) MAX-TRANSACTION-AGE)))

(define-private (calculate-weighted-score (payments uint) (repayments uint) (defaults uint) (volume uint) (age uint))
  (let (
    (payment-score (* payments PAYMENT_WEIGHT))
    (repay-score (* (/ (* repayments volume) u100) REPAYMENT_WEIGHT))
    (default-penalty (* defaults DEFAULT_PENALTY))
    (recency-factor (/ (* RECENCY_WEIGHT (- MAX-TRANSACTION-AGE age)) MAX-TRANSACTION-AGE))
    (volume-factor (* (/ volume u10000) VOLUME_WEIGHT))
    (consistency-factor CONSISTENCY_WEIGHT)
    (raw-score (+ payment-score repay-score recency-factor volume-factor consistency-factor (- default-penalty)))
  )
    (if (> raw-score SCORE-MAX)
      SCORE-MAX
      (if (< raw-score SCORE-MIN)
        SCORE-MIN
        raw-score))))

(define-private (update-history (user principal) (new-score uint) (old-history (list 50 uint)))
  (if (> (len old-history) (- (len old-history) u1))
    (as-max-len? (unwrap-panic (as-max-len? (fold add-to-history (list new-score) old-history))) u50)
    (as-max-len? (list new-score) u50)))

(define-private (add-to-history (score uint) (acc (list 50 uint)))
  (unwrap-panic (as-max-len? (fold prepend-to-list (list score) acc) u50)))

(define-private (prepend-to-list (item uint) (lst (list 50 uint)))
  (unwrap-panic (as-max-len? (cons item lst) u50)))

(define-public (initialize-user (user principal))
  (begin
    (asserts! (not (validate-user-registered user)) (err ERR-USER-NOT-REGISTERED))
    (map-set credit-scores user { score: DEFAULT-INITIAL-SCORE, last-updated: block-height, version: u1 })
    (map-set transaction-histories user { payments: u0, repayments: u0, defaults: u0, total-volume: u0, last-tx-time: block-height })
    (map-set score-histories user (list DEFAULT-INITIAL-SCORE))
    (print { event: "user-initialized", user: user })
    (ok true)))

(define-public (update-score (user principal) (payments uint) (repayments uint) (defaults uint) (volume uint) (tx-time uint))
  (let (
    (caller (contract-caller))
    (current-time block-height)
    (last-update (get last-updated (unwrap! (map-get? credit-scores user) (err ERR-INVALID-USER))))
    (time-diff (- current-time last-update))
  )
    (asserts! (is-eq caller (unwrap! (var-get zk-oracle-contract) (err ERR-NOT-AUTHORIZED))) ERR-NOT-AUTHORIZED)
    (asserts! (validate-metrics payments repayments defaults volume tx-time) (err ERR-INVALID-METRICS))
    (asserts! (>= time-diff (var-get update-frequency)) (err ERR-UPDATE-FREQUENCY))
    (asserts! (<= (- current-time tx-time) MAX-TRANSACTION-AGE) (err ERR-INVALID-TRANSACTION-AGE))
    (let (
      (new-score (calculate-weighted-score payments repayments defaults volume (- current-time tx-time)))
      (old-entry (unwrap! (map-get? credit-scores user) (err ERR-INVALID-USER)))
      (old-history (unwrap! (map-get? score-histories user) (list )))
      (updated-history (update-history user new-score old-history))
    )
      (map-set credit-scores user { score: new-score, last-updated: current-time, version: (+ (get version old-entry) u1) })
      (map-set transaction-histories user { payments: payments, repayments: repayments, defaults: defaults, total-volume: volume, last-tx-time: tx-time })
      (map-set score-histories user updated-history)
      (var-set last-update-time user current-time)
      (print { event: "score-updated", user: user, new-score: new-score })
      (ok new-score))))

(define-public (verify-zk-proof (user principal) (proof-hash (buff 32)))
  (begin
    (asserts! (is-eq contract-caller (unwrap! (var-get zk-oracle-contract) (err ERR-NOT-AUTHORIZED))) ERR-NOT-AUTHORIZED)
    (asserts! (not (is-some (map-get? zk-proofs user))) (err ERR-ZERO-KNOWLEDGE-PROOF-FAILED))
    (map-set zk-proofs user { proof-hash: proof-hash, verified: true, timestamp: block-height })
    (ok true)))

(define-public (set-zk-oracle (oracle principal))
  (begin
    (asserts! (is-none (var-get zk-oracle-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set zk-oracle-contract (some oracle))
    (ok true)))

(define-public (set-update-frequency (freq uint))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get zk-oracle-contract) (err ERR-NOT-AUTHORIZED))) ERR-NOT-AUTHORIZED)
    (asserts! (> freq u0) (err ERR-INVALID-METRICS))
    (var-set update-frequency freq)
    (ok true)))

(define-public (set-history-limit (limit uint))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get zk-oracle-contract) (err ERR-NOT-AUTHORIZED))) ERR-NOT-AUTHORIZED)
    (asserts! (<= limit u200) (err ERR-HISTORY-LIMIT-EXCEEDED))
    (var-set history-limit limit)
    (ok true)))