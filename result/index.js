var polygondata;

document.addEventListener("DOMContentLoaded", () => {
  const $E0 = (node, attrs = {}, children = []) => {
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, value);
    }
    node.append(...children);
  };
  const $E = (tag, attrs = {}, children = []) => {
    const node = tag ? document.createElement(tag) : document.createDocumentFragment();
    $E0(node, attrs, children);
    return node;
  };
  const $SVGE = (tag, attrs = {}, children = []) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    $E0(node, attrs, children);
    return node;
  };
  const resetChildren = (node, children = []) => {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
    node.append(...children);
  };

  const template = document.getElementById("result_row");

  function polygonize(polyStr) {
    const polygons = polyStr.split(";");
    return polygons.map((points) => $SVGE("polygon", { points }));
  }

  class CompareResultRow extends HTMLElement {
    #spanName;
    #spanMsg;
    #glyph1;
    #glyph2;
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      const content = template.content.cloneNode(true);
      this.#spanName = content.getElementById("glyph_name");
      this.#spanMsg = content.getElementById("message");
      this.#glyph1 = content.getElementById("glyph1");
      this.#glyph2 = content.getElementById("glyph2");
      this.shadowRoot.append(content);
    }
    static observedAttributes = [
      "name",
      "message",
      "poly1",
      "poly2",
    ];
    attributeChangedCallback(name, _oldValue, newValue) {
      switch (name) {
        case "name":
          resetChildren(this.#spanName, newValue ? [newValue] : []);
          break;
        case "message":
          resetChildren(this.#spanMsg, newValue ? [newValue] : []);
          break;
        case "poly1":
          resetChildren(this.#glyph1, newValue ? polygonize(newValue) : []);
          break;
        case "poly2":
          resetChildren(this.#glyph2, newValue ? polygonize(newValue) : []);
          break;
      }
    }
  }
  customElements.define("compare-result", CompareResultRow);

  const rootElem = document.getElementById("app");
  resetChildren(rootElem, []);

  if (!Array.isArray(polygondata)) {
    rootElem.append("failed to load polygon data");
    return;
  }

  for (const { name, message, poly1, poly2 } of polygondata) {
    rootElem.append($E("compare-result", { name, message, poly1, poly2 }));
  }
});
