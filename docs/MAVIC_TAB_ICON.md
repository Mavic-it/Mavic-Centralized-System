# Mavic tab icon

The operations app uses `application/web/app/icon.svg` and a multi-resolution `application/web/app/favicon.ico` (16, 32, 48 and 256 pixels). The logo sits on a white circle with padding and transparent outer corners. The client booking icon is separate.

The supplied reference was processed with the built-in imagegen tool. Prompt: “Edit the attached Mavic green and gold logo into a browser tab icon asset. Preserve the exact green and gold glossy emblem, its shapes, proportions, colors and highlights. Put it centered inside a plain white circular background with comfortable padding: emblem occupies about 76% of square canvas width and height. White circle occupies 98% of square canvas. Outside circle must be transparent. No text, no extra symbols, no shadows outside circle. Output square PNG suitable for favicon use. This is a precise compositing edit, do not redesign the emblem.”

The resulting raster is embedded in an SVG with a circular clip for a clean edge, then exported to ICO sizes. Both icon endpoints returned HTTP 200 locally.
