// Approved reviewer source. Browser display data only; never save/wallet defaults.
// The root render/backdrop are authoritative over stale nested duplicates.
export const APPROVED_WARM_V6_SOURCE_SHA256='69e7c65924e3af54111ce9aab2655a3adc6210f12536a9204057d162d3317d8f';
const source={
  "schemaVersion": 1,
  "id": "warm-v6",
  "label": "Warm natural v6 candidate",
  "build": {
    "theme": {
      "id": "warm-v6",
      "backdrop": {
        "inner": "#bfe6f5",
        "outer": "#7cc3e6"
      },
      "rooms": {
        "living": {
          "wall": "#f4efe6",
          "floor": "#bf9a70",
          "trim": "#fbf7ef",
          "floorMaterial": "oak",
          "wallMaterial": "linen"
        },
        "bedroom": {
          "wall": "#e9edf1",
          "floor": "#b08866",
          "trim": "#fbf7ef",
          "floorMaterial": "oak",
          "wallMaterial": "linen"
        },
        "study": {
          "wall": "#efe9dc",
          "floor": "#a87650",
          "trim": "#fbf7ef",
          "floorMaterial": "oak",
          "wallMaterial": "linen"
        },
        "kitchen": {
          "wall": "#f5f0e6",
          "floor": "#aea493",
          "trim": "#fbf7ef",
          "floorMaterial": "ceramic",
          "wallMaterial": "linen"
        },
        "playroom": {
          "wall": "#f6efd9",
          "floor": "#c99560",
          "trim": "#fbf7ef",
          "floorMaterial": "oak",
          "wallMaterial": "linen"
        },
        "bathroom": {
          "wall": "#f6f6f3",
          "floor": "#bfcad0",
          "trim": "#fbf7ef",
          "floorMaterial": "ceramic",
          "wallMaterial": "ceramic"
        },
        "gallery": {
          "wall": "#f4f1ea",
          "floor": "#a87650",
          "trim": "#fbf7ef",
          "floorMaterial": "oak",
          "wallMaterial": "linen"
        },
        "sunroom": {
          "wall": "#eef1e4",
          "floor": "#c4a070",
          "trim": "#fbf7ef",
          "floorMaterial": "oak",
          "wallMaterial": "linen"
        },
        "hallway": {
          "wall": "#f1ebe0",
          "floor": "#bb8a5c",
          "trim": "#fbf7ef",
          "floorMaterial": "oak",
          "wallMaterial": "linen"
        }
      },
      "surfaceRemap": {
        "wall.inner": {
          "from": "#f7ead7",
          "to": "#f4efe6"
        },
        "wall.outer": {
          "from": "#f7ead7",
          "to": "#f4efe6"
        },
        "wall.side": {
          "from": "#d0dcca",
          "to": "#f4efe6"
        },
        "floor.main": {
          "from": "#e7cfaa",
          "to": "#bf9a70"
        },
        "window.frame": {
          "from": "#faf0d7",
          "to": "#fbf7ef"
        }
      },
      "shell": {
        "trim": "#fbf7ef",
        "plinth": "#b5a48c",
        "frame": "#fbf7ef",
        "glass": "#9fc9d6",
        "wallCap": "#fbf7ef"
      },
      "manor": {
        "wall": "#f1ebe0",
        "trim": "#fbf7ef",
        "base": "#b89b7a",
        "wood": "#9a6a45",
        "glass": "#9fc9d6",
        "leaf": "#2d9c46",
        "flower": "#e5483d",
        "gold": "#ffc93a"
      },
      "lighting": {
        "editor": {
          "toneMapping": "neutral",
          "exposure": 1.03,
          "hemisphere": {
            "sky": "#fff6ea",
            "ground": "#e2dbcf",
            "intensity": 1.7
          },
          "sun": {
            "color": "#fff0d8",
            "intensity": 3.4
          },
          "fill": {
            "color": "#dde7f2",
            "intensity": 0.9
          },
          "shadowRadius": 3,
          "contactShadow": "#4a3a2e"
        },
        "student": {
          "toneMapping": "neutral",
          "exposure": 1.03,
          "hemisphere": {
            "sky": "#fff6ea",
            "ground": "#e2dbcf",
            "intensity": 1.7
          },
          "sun": {
            "color": "#fff0d8",
            "intensity": 2.584
          },
          "fill": {
            "color": "#dde7f2",
            "intensity": 0.9
          },
          "shadowRadius": 3,
          "contactShadow": "#4a3a2e"
        }
      },
      "swatches": [
        {
          "id": "cream",
          "label": "Cream",
          "color": "#f6f1e6"
        },
        {
          "id": "oak",
          "label": "Oak",
          "color": "#d58b48"
        },
        {
          "id": "red",
          "label": "Tomato red",
          "color": "#e5483d"
        },
        {
          "id": "green",
          "label": "Grass green",
          "color": "#15864a"
        },
        {
          "id": "blue",
          "label": "Studio blue",
          "color": "#2d63b8"
        },
        {
          "id": "yellow",
          "label": "Lemon yellow",
          "color": "#ffc93a"
        },
        {
          "id": "orange",
          "label": "Orange",
          "color": "#ff8a3d"
        },
        {
          "id": "cocoa",
          "label": "Cocoa",
          "color": "#6b4129"
        }
      ]
    },
    "furniture": {
      "mode": "default",
      "examples": {}
    }
  },
  "render": {
    "toneMapping": "neutral",
    "exposure": 1.03,
    "hemisphere": {
      "sky": "#fff6ea",
      "ground": "#e2dbcf",
      "intensity": 1.7
    },
    "sun": {
      "color": "#fff0d8",
      "intensity": 3.4,
      "azimuth": null,
      "altitude": null
    },
    "fill": {
      "color": "#dde7f2",
      "intensity": 0.9
    },
    "shadowRadius": 3,
    "contactShadow": "#4a3a2e",
    "environmentIntensity": 1
  },
  "backdrop": {
    "inner": "#f7f4ee",
    "outer": "#e2dccf"
  }
};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const APPROVED_WARM_V6=freeze(source);
export const APPROVED_WARM_THEME=freeze({
  ...source.build.theme,id:'warm',
  // Floors use the separately approved fourteen-finish system, not old v6 tints.
  rooms:Object.fromEntries(Object.entries(source.build.theme.rooms).map(([id,{wall,trim,wallMaterial}])=>[id,{wall,trim,wallMaterial}])),
  surfaceRemap:Object.fromEntries(Object.entries(source.build.theme.surfaceRemap).filter(([id])=>id!=='floor.main')),
  backdrop:source.backdrop,
  lighting:{editor:source.render,student:{...source.build.theme.lighting.student,environmentIntensity:source.render.environmentIntensity}},
  floorFinishes:true,appearanceSource:{id:source.id,status:'approved-source',sha256:APPROVED_WARM_V6_SOURCE_SHA256},
});
