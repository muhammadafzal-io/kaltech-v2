---
title: "Retrieval versus fine tuning on domain documents: what changed in 2026, and what did not."
titleAccent: Retrieval
kicker: Bench Test
standfirst: The fine tuning case gets made again every quarter. We ran both approaches over the same regulated corpus and measured retrieval accuracy, cost per query and time to update. One of the three decided it.
author: Kaleem Ahmad
readingTime: 12 min read
featured: true
published: true
order: 1
imageCaption: Feature image — Bench test environment
contents:
  - id: intro
    label: The test
  - id: measured
    label: What we measured
  - id: flips
    label: Where the answer flips
closing:
  paras:
    - We run this kind of test before a build commits to an approach, not after.
    - If you are weighing one against the other on your own documents, the diagnostic is where that gets settled.
  ctaLabel: Get an AI Strategy Consult
  ctaHref: /contact
seo:
  title: "Retrieval versus fine tuning on domain documents | KalTech"
  description: We ran retrieval and fine tuning over the same regulated corpus and measured accuracy, cost per query and time to update. The third measure decided it.
---

<div id="intro" data-body-block>

The argument arrives with a business case attached. A model tuned on your own documents will know your domain, so it will answer questions about that domain more accurately than a general model reading the same documents at query time. It is a reasonable claim and it is testable, which is the only reason it is worth writing about.

We ran both approaches over one regulated corpus, held everything else constant, and measured three things that matter to an operation rather than to a benchmark: whether the answer was correct and attributable, what a query cost at volume, and how long it took to reflect a change in the source documents.

The corpus was policy documentation from a lending operation, roughly the size and messiness of what a mid-market company actually holds. Not a clean dataset. That distinction turned out to matter more than the choice of approach.

</div>

<h2 id="measured" data-body-block>What we <span class="accent">measured</span></h2>

Retrieval accuracy was scored against a set of questions with known answers in the source, marked correct only when the response was right and cited the passage it came from. An answer that is correct without attribution is not usable in a regulated context, so we did not count it.

Cost per query was measured at the volume the operation actually runs, not at a demonstration volume. Time to update was measured from the moment a source document changed to the moment the system answered according to the new version.

<div class="pullout">

The third measure decided it. Accuracy and cost were close enough to argue about. Time to update was not close.

</div>

A tuned model reflects a document change when it is tuned again. A retrieval system reflects it when the document is indexed. In an operation where policy changes monthly and each change carries a compliance date, that difference is not a preference.

The accuracy gap that did appear was smaller than the gap between a well-chunked corpus and a badly chunked one, using the same approach in both cases. Most of what gets attributed to the model is attributable to the preparation of the documents underneath it.

<h2 id="flips" data-body-block>Where the answer <span class="accent">flips</span></h2>

Tuning earns its cost in a narrow band: high query volume against a corpus that changes rarely, where per-query cost dominates and the update cycle is annual rather than monthly. Below that volume the arithmetic does not clear.

<div class="table-wrap">
<table class="dtable">
<thead>
<tr><th>Measure</th><th>Retrieval</th><th>Fine tuned</th></tr>
</thead>
<tbody>
<tr><td>Attributable accuracy</td><td>[PLACEHOLDER]</td><td>[PLACEHOLDER]</td></tr>
<tr><td>Cost per query at volume</td><td>[PLACEHOLDER]</td><td>[PLACEHOLDER]</td></tr>
<tr><td>Time to reflect a change</td><td>[PLACEHOLDER]</td><td>[PLACEHOLDER]</td></tr>
<tr><td>Volume at which cost clears</td><td>[PLACEHOLDER]</td><td>[PLACEHOLDER]</td></tr>
</tbody>
</table>
</div>

What did not change in 2026 is the order of the questions. Whether the corpus holds one definition of each term, and whether the operation can say what a correct answer looks like, still decide the outcome before the architecture does.

On this corpus, retrieval shipped. Not because it won every measure, but because it won the one the operation could not absorb losing.
