import { recipeName, t } from "./i18n.js";
import { esc } from "./ui.js";

const PHOTOS = {
  "arepa with cheese": ["arepa", "Raymvc97, CC BY-SA 4.0"],
  "scrambled eggs with tomato": ["perico", "Pequeño mar, CC BY-SA 4.0"],
  "potato and egg tortilla": ["tortilla", "Tamorlan, CC BY-SA 3.0"],
  "rice and black beans": ["arroz-frijoles", "Horacio Cambeiro, CC BY-SA 3.0"],
  "pasta with tomato": ["pasta", "Benreis, CC BY 3.0"],
};

export function dishPicture(name, foods = []) {
  const photo = PHOTOS[String(name).trim().toLowerCase()];
  if (photo) {
    return `<figure class="dish-photo">
      <img src="/brand/photos/${photo[0]}.jpg" alt="${esc(recipeName(name))}" loading="lazy" width="900" height="1125">
      <figcaption>${esc(t("photo.credit", { credit: photo[1] }))}</figcaption>
    </figure>`;
  }
  return `<figure class="dish-photo dish-engraved" aria-hidden="true"><img src="/app/stills/plate.webp" alt="" width="960" height="960" loading="lazy"></figure>`;
}
