# Real-render reference captures

Captured from a fresh public GitHub clone, with no node_modules and no npm installation, using the bundled Three.js modules and the real v4 robot. Each linked PNG is the actual 1440 x 900 source render. No image-generation assets or simplified scene were used.

The five default/toy pairs have identical camera transforms and triangle counts. Furniture retains actual product default colors in every capture. Toy v1 is a frozen reference, including its current oak bathroom floor and dark plinth; it is not a new approved palette.

| Fixed view | Shipped default reference | Frozen Toy v1 reference |
| --- | --- | --- |
| Living | ![Default living](default--living.png) | ![Toy v1 living](toy-v1--living.png) |
| Bedroom | ![Default bedroom](default--bedroom.png) | ![Toy v1 bedroom](toy-v1--bedroom.png) |
| Kitchen | ![Default kitchen](default--kitchen.png) | ![Toy v1 kitchen](toy-v1--kitchen.png) |
| Bathroom | ![Default bathroom](default--bathroom.png) | ![Toy v1 bathroom](toy-v1--bathroom.png) |
| Two-storey exterior | ![Default exterior](default--exterior.png) | ![Toy v1 exterior](toy-v1--exterior.png) |

See verification.json and the two render-readback files for dimensions, hashes, resolved lights, actual surface maps, camera poses, mesh statistics and fictional fixture contents. This verifies browser rendering, not physical projector appearance or a production deployment.
