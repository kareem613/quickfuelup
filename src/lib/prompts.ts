export function buildFuelPrompt() {
  return `
## Task
You will be given two photos:
1) A gas pump display OR a fuel receipt showing total cost and quantity/volume
2) A vehicle odometer display

## Output (JSON only)
Return **only valid JSON** (no markdown, no backticks, no extra text) matching this shape:

\`\`\`json
{
  "odometer": 123456,
  "fuelQuantity": 12.34,
  "totalCost": 45.67,
  "explanation": "Optional: include only if one or more fields are null"
}
\`\`\`

## Rules
- Use "." as the decimal separator.
- If you cannot determine a value, set it to \`null\` and include a short \`explanation\`.
- If a value can't be determined from an image, briefly describe what the image appears to be (blurry dashboard, dark photo, receipt, random object, etc.) and end with a mildly sarcastic line like:
  "It's a photo of <what it looks like> — how do you expect me to read <missing value> from that?"
`.trim()
}

export function buildServicePrompt(params: {
  vehiclesText: string
  extraFieldsText: string
  documentText?: string
}) {
  const documentTextTrimmed = params.documentText?.trim() ?? ''
  const documentTextForPrompt = documentTextTrimmed ? documentTextTrimmed.slice(0, 12000) : '(none)'
  const documentTextForDebug = documentTextTrimmed ? `(omitted document text; ${documentTextTrimmed.length} chars)` : '(none)'

  const prompt = `
## Task
You will be given a vehicle service invoice/receipt as text and/or images.

Create a sensible set of LubeLogger records from this document.
This is **NOT** necessarily one record per line item — group logically into records that represent one service event/visit.

## Output (JSON only)
Return **only valid JSON** (no markdown, no backticks, no extra text) matching this shape:

\`\`\`json
{
  "records": [
    {
      "recordType": "service",
      "vehicleId": 123,
      "date": "2026-01-31",
      "odometer": 123456,
      "description": "Oil change",
      "totalCost": 89.12,
      "notes": "Optional: detailed work performed",
      "tags": "Optional: comma-separated",
      "extraFields": [{"name": "Oil Type", "value": "5W-30"}],
      "explanation": "Optional: per-record caveats"
    }
  ],
  "explanation": "Optional: overall caveats",
  "warnings": [
    {"path": "/records/0/odometer", "reason": "guessed", "message": "Optional"}
  ]
}
\`\`\`

## Available vehicles
Pick one \`vehicleId\` if confident (or if you can make a reasonable educated guess); otherwise use \`null\`:
${params.vehiclesText}

## Configured extra fields (by record type)
Prefer these names if they match the document:
${params.extraFieldsText}

## Document text
(May be empty for scanned PDFs)
${documentTextForPrompt}

## Rules
- Use "." as the decimal separator.
- Still make your best educated guess when the document strongly suggests a value (e.g. \`vehicleId\` from invoice header).
- Only use \`null\` when you truly cannot determine a value.
- If any value is missing (\`null\`), guessed, uncertain, or conflicting, include a warning:
  - \`path\` like \`/records/<index>/<fieldName>\` (e.g. \`/records/0/vehicleId\`, \`/records/1/totalCost\`)
  - \`reason\`: "missing" | "guessed" | "uncertain" | "conflict"
  - Keep \`message\` short and user-friendly.
- Record type:
  - \`service\` = scheduled maintenance
  - \`repair\` = unplanned fix
  - \`upgrade\` = enhancement
- Create between 1 and 8 records; prefer fewer records unless there are clearly distinct visits/dates/vehicles.
- Do not create one record per part.
- Keep \`description\` VERY concise (2–6 words). Put detail in \`notes\`.
  - Example: description="AC repair", notes="Evacuated/recharged system; replaced condenser; replaced O-rings; leak test; added dye."

## Cost math (when itemized)
- Treat EVERY charge as a line item: parts, labor, fees, shop supplies, discounts/credits (negative), etc.
- Assign each line item to exactly one record, then compute each record's pre-tax subtotal by summing its assigned lines.
- Ensure the sum of record pre-tax subtotals matches the invoice SUBTOTAL (pre-tax). If not, mention it in \`explanation\`.
- If the invoice shows tax amount and/or tax rate:
  - Allocate tax across records proportionally by each record's pre-tax subtotal.
  - Round to cents and adjust the final record by any rounding remainder so totals match.
  - Set each record's \`totalCost\` to (record subtotal + allocated tax).
  - Ensure the sum of \`totalCost\` matches the invoice TOTAL as closely as possible.
- If you cannot confidently allocate costs per record, keep the records but set some \`totalCost\` to \`null\` and explain why in \`explanation\`.
`.trim()

  const debugPrompt = prompt.replace(documentTextForPrompt, documentTextForDebug)
  return {
    prompt,
    debugPrompt,
    documentTextLength: documentTextTrimmed.length,
  }
}

