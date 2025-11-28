import assert from 'node:assert/strict'
import { generateMarkdownView } from '../src/records/markdownView.js'

function testProjectMarkdown() {
  const md = generateMarkdownView(
    'project',
    {
      recordType: 'project',
      recordId: 'PRJ-1',
      title: 'Metabolomics Project',
      state: 'draft',
      shortSlug: 'MP',
      description: 'Project description.'
    },
    {
      binaryDataFiles: ['s3://data/report.pdf']
    }
  )
  const expected = `# Metabolomics Project (PRJ-1)
**Status:** draft · **Record type:** Project · **Slug:** MP

## Overview
Project description.

## Linked Records
- **Binary files:** s3://data/report.pdf

## Biological Context
_No biological context recorded._

## Operations
_No operational metadata recorded._

## Attachments
- s3://data/report.pdf
`
  assert.equal(md, expected)
}

function testExperimentMarkdown() {
  const md = generateMarkdownView(
    'experiment',
    {
      recordType: 'experiment',
      recordId: 'EXP-1',
      title: 'Liver Metabolomics',
      state: 'approved',
      shortSlug: 'LM',
      projectId: 'PRJ-1',
      description: 'Investigating liver pathways.'
    },
    {
      runs: ['RUN-2'],
      taxon: { label: 'Faecalibacterium prausnitzii', id: 'ncbitaxon:632' },
      anatomicalContext: { label: 'liver', id: 'uberon:0002107' },
      cellTypes: [{ label: 'hepatocyte', id: 'cl:0000182' }],
      pathways: [{ label: 'Amino acid metabolism', id: 'reactome:R-HSA-1430728' }],
      operator: { label: 'Brad Marshall', id: 'https://example.org/person/bmarshall' },
      runDate: '2025-01-02T10:00:00Z',
      plateId: 'PL-1',
      binaryDataFiles: ['s3://bucket/raw.csv']
    }
  )
  const expected = `# Liver Metabolomics (EXP-1)
**Status:** approved · **Record type:** Experiment · **Slug:** LM · **Project:** PRJ-1

## Overview
Investigating liver pathways.

## Linked Records
- **Project:** PRJ-1
- **Runs:** RUN-2
- **Plate:** PL-1
- **Binary files:** s3://bucket/raw.csv

## Biological Context
This record focuses on *Faecalibacterium prausnitzii* (ncbitaxon:632) in liver (uberon:0002107). Cell types: hepatocyte (cl:0000182). Pathways: Amino acid metabolism (reactome:R-HSA-1430728).

## Operations
- **Operator:** Brad Marshall (https://example.org/person/bmarshall)
- **Start:** 2025-01-02T10:00:00Z

## Attachments
- s3://bucket/raw.csv
`
  assert.equal(md, expected)
}

testProjectMarkdown()
testExperimentMarkdown()

console.log('markdownView tests passed')
