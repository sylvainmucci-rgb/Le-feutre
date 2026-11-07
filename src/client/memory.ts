import { emptyBook, sanitizeBook, type Book } from "../shared/book";

const KEY = "feutre.book";

export function loadBook(): Book {
  try {
    if (typeof localStorage === "undefined") return emptyBook();
    return sanitizeBook(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return emptyBook();
  }
}

export function saveBook(book: Book) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitizeBook(book)));
  } catch {
    /* navigation privée */
  }
}
