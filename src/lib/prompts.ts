export function buildFuelPrompt() {
  return `
## Task
You will be given two photos:
1) A gas pump display OR a fuel receipt showing total cost and quantity/volume
2) A vehicle odometer display

## Output (JSON only)
JSON only. Must validate against the schema contract below.

## Schema contract (must match)
\`\`\`json
{
  "type": "object",
  "required": ["odometer", "fuelQuantity", "totalCost"],
  "properties": {
    "odometer": { "type": ["number", "null"] },
    "fuelQuantity": { "type": ["number", "null"] },
    "totalCost": { "type": ["number", "null"] },
    "explanation": { "type": ["string", "null"] }
  }
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
JSON only. Must validate against the schema contract below.

## Schema contract (must match)
\`\`\`json
{
  "type": "object",
  "required": ["records"],
  "properties": {
    "records": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["recordType", "vehicleId", "date", "odometer", "description", "totalCost"],
        "properties": {
          "recordType": { "enum": ["service", "repair", "upgrade", null] },
          "vehicleId": { "type": ["number", "null"] },
          "date": { "type": ["string", "null"] },
          "odometer": { "type": ["number", "null"] },
          "description": { "type": ["string", "null"] },
          "totalCost": { "type": ["number", "null"] },
          "notes": { "type": ["string", "null"] },
          "tags": { "type": ["string", "null"] },
          "extraFields": {
            "type": ["array", "null"],
            "items": {
              "type": "object",
              "required": ["name", "value"],
              "properties": {
                "name": { "type": "string", "minLength": 1 },
                "value": { "type": "string", "minLength": 1 }
              }
            }
          },
          "explanation": { "type": ["string", "null"] }
        }
      }
    },
    "explanation": { "type": ["string", "null"] },
    "warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "reason"],
        "properties": {
          "path": { "type": "string", "minLength": 1 },
          "reason": { "enum": ["missing", "uncertain", "inferred"] },
          "message": { "type": ["string", "null"] }
        }
      }
    }
  }
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
- If any value is missing (\`null\`) or based on a guess, include a warning:
  - \`path\` like \`/records/<index>/<fieldName>\` (e.g. \`/records/0/vehicleId\`, \`/records/1/totalCost\`)
  - \`reason\`: ONLY one of:
    - "missing" = there is not enough data to make a confident value (use \`null\` in the field)
    - "inferred" = value is determined with confidence based on other information in the document (not a direct lookup)
    - "uncertain" = you made a best-effort guess based on partial evidence (field may be non-null)
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
