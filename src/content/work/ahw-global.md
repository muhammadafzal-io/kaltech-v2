---
title: AHW Global
order: 2
standfirst: A logistics operation asked for an ERP. The systems underneath it could not agree on what a shipment was.
industry: Logistics and cross-border shipping · US operation
industryShort: Logistics and cross-border shipping
constraintFound: Data
imageCaption: Product interface — AHW shipment view
imageGround: slate

cardParas:
  - The brief was a full ERP replacement. The operation held more than one working definition of a shipment, a customer and an order, so an ERP built over it would have made every disagreement permanent.
  - We reconciled the definitions first, then migrated workflow by workflow with the existing platform live throughout.
cardFigure: 3→1
cardFigureLabel: Definitions of a shipment, consolidated
cardCount: null
cardSuffix: ""

snapshot:
  - label: Sector
    value: Logistics and cross-border shipping
  - label: Scale
    value: US operation, multi-tenant platform
  - label: Engagement
    value: Live shipping platform, then a logistics ERP
  - label: Constraint found
    value: Data
  - label: Systems
    value: Shipment records, customer and order model, rating, payments

situation:
  - AHW moves freight across borders for commercial clients. KalTech had already built and shipped the platform running that operation, so the next request came with history behind it.
  - The brief was a replacement. Retire what was in place, consolidate everything into one system, and run the business from it.

constraint:
  figure: Data
  figureLabel: The binding constraint
  paras:
    - The operation held more than one working definition of its core records. A shipment meant one thing in the operational view and another in the commercial one. A customer resolved differently depending on which system was asked. These were not integration faults. They were definitional disagreements that integration would have hardened rather than resolved.
    - An ERP built over that inherits every disagreement and makes each one permanent. The number the platform reports becomes the number the business argues about.

setAside:
  - heading: Full replacement, as briefed
    body: The failure mode of most mid-market ERP projects. It requires the operation to keep running on a system being decommissioned while a replacement is validated against records that do not agree.
    taken: false
  - heading: Integration layer over existing systems
    body: Cheaper, faster, and it preserves the exact ambiguity causing the problem.
    taken: false
  - heading: Reconcile the definitions, then migrate by workflow
    body: The path taken. Establish one authoritative definition of each core record, then move the operation across workflow by workflow with the existing platform live throughout.
    taken: true

built:
  - num: "01"
    heading: A single record model
    body: One definition each of a shipment, a customer, an order and a rate, agreed with the operators who use them rather than derived from whichever system was loudest.
  - num: "02"
    heading: Multi-tenant from the first line
    body: Built to hold more than one operating company, with AHW as the first tenant rather than the only one. That decision is taken at the start and is not retrofittable.
  - num: "03"
    heading: Payments through Stripe
    body: Card data never touches AHW systems. A compliance decision taken at scoping rather than discovered at audit.
  - num: "04"
    heading: Staged workflow migration
    body: The live platform stayed in production throughout. No cutover weekend.
  - num: "05"
    heading: Reporting on one source
    body: A single reconciled view replacing the parallel numbers the business had been reconciling by hand.

difference:
  - The architecture decision. A single-tenant build would have delivered the same operational result and closed off the licensing position entirely. Multi-tenancy cost more at the start and is the reason the platform is now an asset rather than an internal system.

outcome:
  primary: "3→1"
  primaryLabel: Definitions of a shipment, consolidated
  secondary:
    - value: Shorter
      label: Reporting cycle
    - value: Multi-tenant
      label: Platform architecture
    - value: Removed
      label: Manual reconciliation
  footnote: Figures drawn from client-side reporting.

seo:
  title: AHW Global case study in cross-border shipping | KalTech
  description: A cross-border shipping operation briefed an ERP replacement. It held more than one working definition of its core records, so we reconciled those first.
---
