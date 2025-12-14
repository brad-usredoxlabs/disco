




plate:
  id: plate-fire-001
  assay_ref: assay:fire-basic-v1

assay:
  id: assay:fire-basic-v1
  channels:
    - id: FITC
      measures: thiol_redox_proxy
      derived_from_roles: [sample, treatment, assay_material]

materials:
  - id: cells:hepG2
    label: HepG2 cells
  - id: dye:thiol
    label: Thiol redox dye
  - id: cmpd:ppara_agonist
    label: PPARα agonist
    mechanism: agonist

wells:
  - well: A01
    inputs:
      - material: cells:hepG2
        role: sample
      - material: dye:thiol
        role: assay_material
      - material: cmpd:ppara_agonist
        role: treatment

  - well: A02
    inputs:
      - material: cells:hepG2
        role: sample
      - material: dye:thiol
        role: assay_material
