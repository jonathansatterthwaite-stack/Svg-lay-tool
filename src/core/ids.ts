let counter = 0;

/** Short, collision-resistant ids for layers and effects. */
export function createId(prefix = 'l'): string {
  counter = (counter + 1) % 0xffff;
  const rand = Math.floor(Math.random() * 0xffffff).toString(36);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}${time}${rand}${counter.toString(36)}`;
}
