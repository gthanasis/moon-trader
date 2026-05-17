/** Which part of the trading process a lesson is about. */
export type LessonCategory = 'entry' | 'exit' | 'sizing' | 'regime' | 'risk' | 'general'

/** Lifecycle state of a lesson in the ledger. */
export type LessonStatus = 'active' | 'retired'

/**
 * A falsifiable trading lesson extracted by the post-mortem critic. Evidence
 * accumulates as later periods validate or contradict it; once contradicting
 * evidence dominates, the lesson is retired and stops feeding the prompt.
 */
export interface Lesson {
  id: string
  text: string
  category: LessonCategory
  evidenceFor: number
  evidenceAgainst: number
  status: LessonStatus
  createdAt: Date
  updatedAt: Date
}

/** A lesson proposal from the critic, before it has accumulated any evidence. */
export interface LessonProposal {
  text: string
  category: LessonCategory
}
