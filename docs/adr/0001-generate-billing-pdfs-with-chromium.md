# Generate Billing PDFs with Chromium

Billing PDFs are rendered on demand from the latest saved FA017/FA018 record with a server-side Chromium engine, because it uses the same CSS layout model as the approved on-screen form and preserves selectable text. We deliberately do not restore the former html2canvas/jsPDF exporter: it shifted text onto grid lines and clipped wrapped rows. Browser print remains available as a fallback, while deployment must provide a Chromium-compatible executable through `PDF_CHROMIUM_EXECUTABLE_PATH` or a supported local Chrome/Edge installation.

