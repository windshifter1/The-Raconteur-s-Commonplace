/** Baked bookshelf layout for the view-only /full experience.
 *  Three equal walnut bays from the real 3-wide case (7 even shelves each).
 */
function evenShelves(prefix, books) {
  return books.map((count, i) => ({
    id: `${prefix}-${i + 1}`,
    weight: 1,
    books: count,
    boxes: [],
  }));
}

export default {
  version: 2,
  depth: 76,
  edges: 14,
  units: [
    {
      id: 'unit-bay-a',
      x: 26.9,
      y: 8.5,
      w: 15.4,
      h: 84,
      shelves: evenShelves('shelf-a', [30, 28, 32, 26, 31, 29, 27]),
    },
    {
      id: 'unit-bay-b',
      x: 42.3,
      y: 8.5,
      w: 15.4,
      h: 84,
      shelves: evenShelves('shelf-b', [28, 31, 27, 30, 26, 32, 29]),
    },
    {
      id: 'unit-bay-c',
      x: 57.7,
      y: 8.5,
      w: 15.4,
      h: 84,
      shelves: evenShelves('shelf-c', [32, 26, 29, 28, 30, 27, 31]),
    },
  ],
  savedAt: '2026-08-17T00:00:00.000Z',
};
