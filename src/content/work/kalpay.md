---
title: KalPay
order: 1
standfirst: A lending platform built for an operation writing loans faster than it could process them.
industry: Regulated consumer lending · BNPL and device financing
industryShort: Regulated consumer lending
constraintFound: "[PLACEHOLDER]"
imageCaption: Product interface — KalPay lending console
imageGround: sand

cardParas:
  - The business was writing consumer loans faster than its operation could process them. Leadership had scoped an automation project assuming the bottleneck was decision speed.
  - Two agents given the same application produced different sequences of work, so there was no single specification to encode. We said so before scoping anything.
cardFigure: 92%
cardFigureLabel: Decisions returned without manual review
cardCount: 92
cardSuffix: "%"

snapshot:
  - label: Sector
    value: Regulated consumer lending
  - label: Scale
    value: 10,000+ applications per day at peak
  - label: Engagement
    value: Platform build, then ongoing delivery
  - label: Constraint found
    value: "[PLACEHOLDER]"
  - label: Systems
    value: Borrower portal, agent console, risk tooling, analytics

situation:
  - The business was writing consumer loans faster than its operation could process them. Applications arrived through several channels, moved through a document check, sat with an agent for a decision, and were recorded in a mix of tooling that had accumulated as volume grew.
  - Leadership had scoped an automation project. The brief assumed the bottleneck was decision speed and proposed a scoring model to shorten it.

constraint:
  figure: "[PLACEHOLDER]"
  figureLabel: The binding constraint
  paras:
    - Two agents given the same application produced different sequences of work. Document checks happened at different points, exceptions were escalated on different thresholds, and the point at which an application was considered complete varied by agent and by channel. There was no single specification of the work.
    - Software applied to that produces an unreadable result. A scoring model would have automated a decision at the end of a process nobody could describe. We said so before scoping anything.

setAside:
  - heading: Score first, standardise later
    body: Fastest to demo. It would have produced a model trained on inconsistent inputs and metrics nobody could defend to a regulator.
    taken: false
  - heading: Full process redesign before any build
    body: Correct in theory. It would have taken the operation offline during a growth period the business could not absorb.
    taken: false
  - heading: Specify the process by encoding it
    body: The path taken. Build the platform so the workflow enforces the sequence, so specification and system arrive together rather than one waiting on the other.
    taken: true

built:
  - num: "01"
    heading: Lead capture across channels
    body: Applications from every source entering one queue in one state, with source retained for attribution.
  - num: "02"
    heading: Document verification in the flow
    body: Verification positioned as a gate rather than a step an agent could reorder, so an application cannot advance in an ambiguous state.
  - num: "03"
    heading: Agent assignment and console
    body: Routing by capacity and case type, with the sequence of work fixed by the system rather than by habit.
  - num: "04"
    heading: Drop-off analytics
    body: Instrumentation at every stage, which made visible where applications were being lost rather than where the team assumed they were.
  - num: "05"
    heading: Admin and risk tooling
    body: Configuration, thresholds and audit trail in one place, so a policy change is a setting rather than a retraining exercise.

difference:
  - The scoring model was eventually built. It works because the process underneath it was specified first. Had the original brief been delivered as written, the same model would have been trained on an operation that had never agreed with itself.

outcome:
  primary: "[PLACEHOLDER]"
  primaryLabel: Decisions returned without manual review
  secondary:
    - value: "[PLACEHOLDER]"
      label: Applications processed per agent
    - value: "[PLACEHOLDER]"
      label: Time to decision, median
    - value: "[PLACEHOLDER]"
      label: Audit findings on sequence compliance
  footnote: Figures drawn from client-side reporting over [PLACEHOLDER].

seo:
  title: KalPay case study in regulated consumer lending | KalTech
  description: A regulated consumer lending operation briefed a scoring model. We found the binding constraint before scoping anything, and built the platform against it.
---
