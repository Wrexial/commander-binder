// src/ui/flipCard.js
export function addFlipCard(frontUrl, backUrl) {
  const container = document.createElement("div");
  container.className = "flip-card";

  const inner = document.createElement("div");
  inner.className = "flip-card-inner";

  const front = new Image();
  front.src = frontUrl;
  front.className = "flip-card-front";

  const back = new Image();
  back.src = backUrl;
  back.className = "flip-card-back";

  inner.appendChild(front);
  inner.appendChild(back);
  container.appendChild(inner);

  container.addEventListener("click", () => {
    container.classList.toggle("flipped");
  });

  return container;
}
