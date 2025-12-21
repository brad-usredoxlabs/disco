---
metadata:
  recordType: protocol
  state: draft
  id: PRO-TEST
  title: Sample protocol
  family: sample_family
  version: 1.0.0
data:
  labwareRoles:
    cell_plate:
      kind: plate
    media_reservoir:
      kind: reservoir
  events:
    - id: evt-1
      label: Seed cells
      event_type: transfer
      details:
        type: transfer
        source_role: media_reservoir
        target_role: cell_plate
        mapping:
          - source_well: SRC1
            target_well: A1
          - source_well: SRC1
            target_well: A2
        volume: "${seed_volume}"
    - id: evt-2
      label: Incubate
      event_type: incubate
      details:
        type: incubate
        labware_role: cell_plate
        duration: "${incubation_time}"
---

# Sample protocol body
