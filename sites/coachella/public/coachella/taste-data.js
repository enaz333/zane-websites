// Broad styles let a genre-tagged export and a plain artist-name export both work.
// Each group lists lineup candidates first, followed by other recognizable references.
window.COACHELLA_STYLES = [
  {
    label: "dance pop", genre: /dance pop|electropop|pop dance|synthpop|dancepop|^pop$/,
    lineup: ["Dua Lipa", "Zara Larsson", "Madonna", "Robyn", "Tove Lo", "Magdalena Bay", "SG Lewis", "Caroline Polachek", "ADÉLA", "MUNA", "Remi Wolf", "Haute & Freddy"],
    references: ["Charli XCX", "Lady Gaga", "Kylie Minogue", "Chappell Roan", "Britney Spears", "Carly Rae Jepsen", "Ariana Grande", "Sabrina Carpenter", "The Weeknd", "Kesha"]
  },
  {
    label: "house and UK dance", genre: /house|garage|ukg|drum and bass|drum bass|electronic|^dance$/,
    lineup: ["Peggy Gou", "Dom Dolla", "Barry Can’t Swim", "Four Tet", "Chris Stussy", "Cloonee", "Odd Mob", "Jazzy", "MPH", "Chase & Status", "Silva Bumpa", "Vintage Culture", "Vandelux", "Adam Ten", "Solomun", "BOLO", "Talón", "Omar+"],
    references: ["Fred again..", "Disclosure", "Jamie xx", "Kaytranada", "John Summit", "FISHER", "Chris Lake", "Bicep", "BOLO THE DJ", "Floating Points", "Overmono", "Daft Punk"]
  },
  {
    label: "techno and trance", genre: /techno|trance|hard dance|hardstyle|rave/,
    lineup: ["Charlotte de Witte", "Amelie Lens x Sara Landry", "KI/KI", "Brutalismus 3000", "Boris Brejcha", "Mathame", "Tiësto", "Underworld"],
    references: ["Amelie Lens", "Sara Landry", "I Hate Models", "Marlon Hoffstadt", "Nina Kraviz", "VTSS", "Eli Brown"]
  },
  {
    label: "R&B and soul", genre: /r and b|rnb|soul|motown|quiet storm/,
    lineup: ["SZA", "Kehlani", "Leon Thomas", "Mariah the Scientist", "Victoria Monét", "Jorja Smith", "Odeal", "Steve Lacy", "Leon Bridges", "Jacob Lusk", "The Womack Sisters", "Dinner Party", "Kelela"],
    references: ["Frank Ocean", "Daniel Caesar", "Summer Walker", "H.E.R.", "Solange", "D'Angelo", "Erykah Badu", "Aaliyah", "Jhené Aiko", "Sade", "Rihanna", "Kali Uchis"]
  },
  {
    label: "indie and alternative", genre: /indie|alternative|dream pop|psychedelic|bedroom pop|shoegaze|folk/,
    lineup: ["Tame Impala", "Phoebe Bridgers", "Pinegrove", "Caroline Polachek", "This Is Lorelei", "mary in the junkyard", "Gang of Youths", "Role Model", "The Neighbourhood", "Empire of the Sun", "Florence Road", "Chanel Beads", "American Football"],
    references: ["boygenius", "Lucy Dacus", "Julien Baker", "Mitski", "Japanese Breakfast", "Clairo", "Alex G", "Big Thief", "Beach House", "Mac DeMarco", "Radiohead", "The Strokes", "The xx", "Lorde", "Bon Iver"]
  },
  {
    label: "punk and guitar rock", genre: /punk|emo|hardcore|grunge|metal|alternative rock|^rock$/,
    lineup: ["Weezer", "The Damned", "Pennywise", "Social Distortion", "La Dispute", "Basement", "Lambrini Girls", "Måneskin", "Fat Dog", "Angine de Poitrine", "American Football"],
    references: ["Turnstile", "Green Day", "The Clash", "Bad Religion", "Fugazi", "Paramore", "Title Fight", "Nirvana", "Blink-182"]
  },
  {
    label: "rap and hip-hop", genre: /rap|hip hop|trap|drill|rage/,
    lineup: ["Don Toliver", "Freddie Gibbs", "Fetty Wap", "EsDeeKid", "Nettspend", "xaviersobased", "Zack Fox", "Murda Beatz", "Milo J", "Drain Gang"],
    references: ["Travis Scott", "Kendrick Lamar", "Tyler, The Creator", "Playboi Carti", "Future", "Young Thug", "JID", "MF DOOM", "A$AP Rocky", "Baby Keem"]
  },
  {
    label: "Latin and club", genre: /reggaeton|latin|cumbia|urbano|dembow|perreo/,
    lineup: ["Daddy Yankee", "Becky G", "Bad Gyal", "Milo J", "AKRIILA", "Los Pibes Chorros"],
    references: ["Bad Bunny", "KAROL G", "J Balvin", "Rosalía", "Rauw Alejandro", "Feid", "Bizarrap", "Ozuna", "Don Omar", "Peso Pluma"]
  },
  {
    label: "K-pop and Asian pop", genre: /k pop|kpop|j pop|p pop|ppop/,
    lineup: ["JISOO", "BABYMONSTER", "NCT", "ATARASHII GAKKO!", "SB19", "no na"],
    references: ["BLACKPINK", "BTS", "TWICE", "NewJeans", "aespa", "LE SSERAFIM", "Red Velvet", "ROSÉ", "JENNIE", "LISA"]
  },
  {
    label: "Afrobeats", genre: /afrobeat|afropop|afro pop|amapiano/,
    lineup: ["Ayra Starr", "Odeal"],
    references: ["Burna Boy", "Wizkid", "Tems", "Rema", "Asake", "Tyla", "Davido"]
  }
];
