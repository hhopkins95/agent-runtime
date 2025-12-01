export const normalizeString = (str: string) => {
  return str.toLowerCase().replace(/ /g, '_');
}