---
title: Hasanah
order: 4
standfirst: "A legal technology firm asked for an AI research assistant. The law it had to read did not agree with itself."
industry: Legal technology · Saudi law
industryShort: Legal technology
constraintFound: Data
imageCaption: "Product interface — case research workspace"
imageGround: sand

cardParas:
  - "The brief was an assistant that would research Saudi law for each case and draft from it."
  - "The statutes and rulings it would read existed in several versions and formats that did not reconcile. We structured the corpus first, then built retrieval that cites the exact article."
cardFigure: "8 hrs"
cardFigureLabel: Saved per case
cardCount: null
cardSuffix: ""

snapshot:
  - label: Sector
    value: "Legal technology"
  - label: Scale
    value: "Case work across Saudi statutes and rulings"
  - label: Engagement
    value: "Diagnostic, then a research and drafting build"
  - label: Constraint found
    value: "Data"
  - label: Systems
    value: "Statute corpus, case files, retrieval, drafting workspace"

situation:
  - "Hasanah works on cases governed by Saudi law. Lawyers spent hours per case locating the relevant articles, checking which version applied and assembling the research before any drafting began."
  - "The brief was an AI assistant to do that research and produce a first draft."

constraint:
  figure: Data
  figureLabel: The binding constraint
  paras:
    - "The source material was the problem. The same statute existed in more than one version and format, amendments were not consistently linked to the text they changed, and the case files referred to articles in different ways."
    - "An assistant reading that corpus would have answered confidently from whichever version it found first. In legal work an answer without the right citation is not usable."

setAside:
  - heading: "Fine-tune a model on the documents"
    body: "Would have learned the disagreement along with the law, with no passage to cite."
  - heading: "An off-the-shelf legal assistant"
    body: "Not built for Saudi statute or for the firm’s case structure."
  - heading: "Structure the corpus, then retrieve with citations"
    body: "One versioned record per article, so every answer points to the text that applies."
    taken: true

built:
  - num: "01"
    heading: "A versioned statute corpus"
    body: "Each article held once, with its amendments and effective dates linked to it."
  - num: "02"
    heading: "Retrieval that cites the article"
    body: "Every research answer returns the exact article and version it relied on."
  - num: "03"
    heading: "A drafting workspace"
    body: "Research assembled per case and carried into a first draft the lawyer reviews and signs off."

difference:
  - "The time saved came from settling what the law said before asking a model to read it. Once each article had one authoritative version, research could be trusted and reviewed quickly."

outcome:
  primary: "8 hrs"
  primaryLabel: Saved per case
  secondary:
    - value: "Faster"
      label: "Research per case"
    - value: "Every answer"
      label: "Cited to the article and version"
    - value: "Fewer"
      label: "Rework at review"
  footnote: Figures drawn from client-side reporting.

seo:
  title: "Hasanah: legal research that cites the article | KalTech"
  description: "A legal technology firm asked for an AI research assistant for Saudi law. We structured and versioned the statute corpus first, then built retrieval that cites."
---
