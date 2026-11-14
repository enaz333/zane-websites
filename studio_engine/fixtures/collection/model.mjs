export const items = [
  {id:'rug',name:'Anatolian rug',category:'Textiles',description:'A geometric wool weaving.'},
  {id:'vase',name:'Blue ceramic vase',category:'Ceramics',description:'A small hand-thrown vessel.'},
  {id:'print',name:'Austin art print',category:'Art',description:'A colorful neighborhood study.'},
  {id:'blanket',name:'Woven blanket',category:'Textiles',description:'An everyday cotton favorite.'},
];
export function select(collection, query, category, favorites, onlyFavorites) {
  return collection.filter(item => item.name.toLowerCase().includes(query.toLowerCase()) &&
    (!category || item.category === category) && (!onlyFavorites || favorites.includes(item.id)));
}
export function toggle(favorites, id) {
  return favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id];
}
