import { describe, expect, it } from 'vitest';
import { centurionBrand, centurionPdfTheme } from '../../../src/server/reports/lib/pdf-themes/centurion';
import {
  conformiteLabel,
  faitLabel,
  filtersLabel,
  formatRate,
  referentialLabel,
  referentialsLabel,
} from '../../../src/server/reports/lib/report-labels';
import type { OccurrenceDto } from '../../../src/shared/schemas';

describe('CENTURION PDF theme', () => {
  it('carries the DESIGN.md brand tokens', () => {
    expect(centurionBrand.primary).toBe('#451DC7');
    expect(centurionBrand.deep).toBe('#360058');
    expect(centurionBrand.accent).toBe('#04F06A');
    expect(centurionBrand.ink).toBe('#111111');
    expect(centurionBrand.surface).toBe('#FFFFFF');
    expect(centurionBrand.border).toBe('#E5E0F0');
  });

  it('maps the tokens onto the pdfcn theme with Poppins and A4 landscape', () => {
    expect(centurionPdfTheme.colors.primary).toBe('#451DC7');
    expect(centurionPdfTheme.colors.background).toBe('#FFFFFF');
    expect(centurionPdfTheme.colors.foreground).toBe('#111111');
    expect(centurionPdfTheme.colors.border).toBe('#E5E0F0');
    expect(centurionPdfTheme.colors.accent).toBe('#04F06A');
    expect(centurionPdfTheme.typography.body.fontFamily).toBe('Poppins');
    expect(centurionPdfTheme.typography.heading.fontFamily).toBe('Poppins');
    expect(centurionPdfTheme.page).toEqual({ size: 'A4', orientation: 'landscape' });
  });
});

describe('report presentation labels', () => {
  it('translates canonical values to French without altering them', () => {
    expect(conformiteLabel('conforme')).toBe('Conforme');
    expect(conformiteLabel('partiellement_conforme')).toBe('Partiellement conforme');
    expect(conformiteLabel('non_conforme')).toBe('Non conforme');
    expect(conformiteLabel('non_applicable')).toBe('Non applicable');
    expect(referentialLabel('iso_27001')).toBe('ISO 27001');
    expect(referentialLabel('pci_dss')).toBe('PCI DSS');
    expect(referentialLabel('soc_2')).toBe('SOC 2');
    expect(referentialLabel('iso_22301')).toBe('Iso 22301');
    expect(referentialsLabel(['iso_27001', 'pci_dss'])).toBe('ISO 27001 + PCI DSS');
    expect(formatRate({ value: null })).toBe('—');
    expect(formatRate({ value: 0.5 })).toBe('50,0 %');
  });

  it('labels FAIT from the realization state', () => {
    const open = { state: 'open', realization: null } as unknown as OccurrenceDto;
    const done = { state: 'completed', realization: { fait: true } } as unknown as OccurrenceDto;
    const notDone = { state: 'completed', realization: { fait: false } } as unknown as OccurrenceDto;
    expect(faitLabel(open)).toBe('—');
    expect(faitLabel(done)).toBe('Oui');
    expect(faitLabel(notDone)).toBe('Non');
  });

  it('summarizes active filters', () => {
    expect(filtersLabel({})).toBe('aucun');
    expect(filtersLabel({ referentiel: 'pci_dss', search: 'accès' })).toBe(
      'référentiel PCI DSS · recherche « accès »',
    );
  });
});
