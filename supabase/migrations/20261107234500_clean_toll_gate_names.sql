-- Clean toll gate names by stripping matrix and reference suffixes at the end:
-- [PDF reference], [Stage 3 matrix], [2026 matrix], [2025 matrix], [SLEX matrix],
-- [STAR matrix], [CALAX matrix], [CAVITEX matrix], [Skyway matrix], [MCX matrix],
-- [SCTEX matrix], (fixed system), and (standalone fixed system).

UPDATE public.toll_gate_rates
SET gate_name = TRIM(REGEXP_REPLACE(
      gate_name,
      '\s*(\[(?:PDF reference|Stage \d+ matrix|\d+ matrix|[A-Za-z0-9_ -]+ matrix)\]|\((?:standalone )?fixed system\))\s*$',
      '',
      'gi'
    )),
    updated_at = now()
WHERE gate_name ~* '(\[(?:PDF reference|Stage \d+ matrix|\d+ matrix|[A-Za-z0-9_ -]+ matrix)\]|\((?:standalone )?fixed system\))\s*$';

