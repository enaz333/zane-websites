// Coordinates are measured on the original 1080 × 1350 poster.
// Each row gives its top, bottom, right edge, and the left edge of each artist.
// Crop offsets convert the original coordinates to each image's local coordinates.
(() => {
  function lineup(label, date, image, top, bottom, rows) {
    const performances = rows.flatMap(([y, endY, right, entries]) =>
      entries.map(([x, name, ...aliases], index) => ({
        name,
        aliases,
        rect: {
          x, y: y - top,
          w: (entries[index + 1]?.[0] ?? right) - x - 2,
          h: endY - y
        }
      }))
    );
    return { label, date, top, image: `assets/${image}.jpg`, width: 1080, height: bottom - top, performances };
  }

  window.COACHELLA_LINEUP = {
    friday: lineup("Friday", "April 9 & 16", "friday", 178, 489, [
      [182, 249, 1056, [[839, "Dua Lipa"]]],
      [243, 286, 187, [[28, "Madonna"]]],
      [251, 286, 1052, [[188, "Zara Larsson"], [344, "Steve Lacy"], [469, "JISOO"], [541, "Diljit Dosanjh"], [688, "Peggy Gou"], [808, "Kehlani"], [897, "Solid Grooves"]]],
      [292, 323, 1054, [[28, "Giorgio Moroder"], [197, "Social Distortion"], [366, "Pinegrove"], [474, "Angine de Poitrine"], [647, "Leon Thomas"], [780, "Drain Gang"], [893, "Snow Strippers"]]],
      [325, 358, 1054, [[27, "Mike D 5D", "Mike D"], [134, "Chris Stussy", "Chris Stassy"], [281, "Milo J"], [354, "SG Lewis"], [459, "Kelela"], [529, "Franky Rizardo"], [686, "Fetty Wap"], [798, "Vintage Culture"], [963, "The Damned"]]],
      [363, 391, 1055, [[28, "ATARASHII GAKKO!"], [201, "Nettspend"], [307, "American Football"], [478, "xaviersobased"], [620, "La Dispute"], [724, "Haute & Freddy"], [869, "The Hellp"], [949, "Disco Dom"]]],
      [394, 425, 1054, [[45, "MPH"], [96, "Bella Kay"], [195, "This Is Lorelei"], [333, "The Womack Sisters"], [493, "mary in the junkyard"], [690, "Close Friends Only"], [867, "Obskür"], [944, "Jacob Lusk"]]],
      [427, 455, 1054, [[87, "LEENALCHI"], [183, "Bea Miller"], [285, "Gang of Youths"], [413, "Love Spells"], [521, "Rafael"], [587, "Nirosta Steel"], [712, "Ragie Ban"], [811, "Jakob Nowell and THE CASTLE", "Jakob Nowell", "Jakobs Castle"]]],
      [458, 484, 1054, [[480, "Eli"], [508, "Las Petunias"], [625, "Violet Grohl"], [734, "Jackie Hollander"], [883, "Jamback x Marsolo", "Jamback", "Marsolo"]]]
    ]),
    saturday: lineup("Saturday", "April 10 & 17", "saturday", 474, 739, [
      [474, 530, 323, [[25, "Tame Impala"]]],
      [535, 575, 1057, [[27, "Phoebe Bridgers"], [258, "Weezer"], [353, "Tiësto"], [420, "Martin Garrix"], [560, "Robyn"], [629, "Role Model"], [745, "ADÉLA"], [812, "Måneskin"], [917, "Solomun"], [1010, "NCT"]]],
      [582, 613, 1055, [[27, "Enigma"], [97, "Underworld"], [214, "Charlotte de Witte"], [374, "Leon Bridges"], [498, "Cloonee"], [578, "Magdalena Bay"], [723, "Barry Can’t Swim"], [887, "Boy Harsher"], [1007, "KI/KI"]]],
      [617, 646, 1055, [[27, "Mariah the Scientist"], [213, "Bad Gyal"], [307, "Basement"], [414, "Brutalismus 3000"], [596, "Beltran"], [681, "underscores"], [815, "SB19"], [874, "Twin Tribes"], [990, "Odeal"]]],
      [650, 678, 1055, [[27, "Bassvictim"], [128, "Los Pibes Chorros"], [297, "Tiffany Day"], [403, "no na"], [465, "Mathame"], [561, "ear"], [603, "Vandelux"], [695, "rommulas"], [794, "Apollonia"], [886, "Getdown Services"]]],
      [681, 710, 961, [[27, "Good Neighbours"], [179, "First Day Back"], [313, "Jimi Jules"], [410, "Twisted Teens"], [543, "Murda Beatz"], [666, "Villanelle"], [756, "Kolter x Sidney Charles", "Kolter", "Sidney Charles"]]],
      [712, 737, 534, [[27, "La Texana"], [116, "OMRI."], [179, "Volkoder"], [265, "Zimmer90"], [363, "LuSiD"], [422, "Dream Boat"]]]
    ]),
    sunday: lineup("Sunday", "April 11 & 18", "sunday", 734, 1009, [
      [736, 795, 1055, [[950, "SZA"]]],
      [795, 837, 1055, [[26, "Don Toliver"], [195, "Dom Dolla"], [330, "Kygo"], [393, "Empire of the Sun"], [536, "Four Tet"], [626, "The Neighbourhood"], [797, "Becky G"], [888, "BABYMONSTER"]]],
      [841, 875, 1055, [[26, "Amelie Lens x Sara Landry", "Amelie Lens", "Sara Landry"], [258, "Remi Wolf"], [360, "Tove Lo"], [436, "Victoria Monét"], [582, "EsDeeKid"], [677, "Caroline Polachek"], [849, "Chase & Status"], [986, "MUNA"]]],
      [876, 911, 1055, [[26, "Boris Brejcha"], [157, "Jorja Smith"], [270, "The Avalanches"], [385, "BOLO", "BOLO THE DJ"], [441, "Pennywise"], [552, "Freddie Gibbs"], [684, "Shygirl"], [758, "Julia Wolf"], [858, "Odd Mob"], [947, "Ayra Starr"]]],
      [913, 944, 1055, [[51, "Lambrini Girls"], [177, "AKRIILA"], [258, "Dinner Party"], [377, "Silva Bumpa"], [493, "DJ Habibeats"], [616, "Chanel Beads"], [742, "Adam Ten"], [835, "After"], [893, "Zack Fox"], [978, "Fat Dog"]]],
      [946, 975, 1055, [[156, "Omar+"], [219, "Genesis Owusu"], [356, "Joshua Slone"], [478, "The Mainliners"], [602, "Marten Lou x Alex Wann", "Marten Lou", "Alex Wann"], [817, "ChaseWest"], [923, "Florence Road"]]],
      [977, 1003, 1055, [[746, "Jazzy"], [799, "TUL8TE"], [868, "Talón"], [923, "Klave Efectiva"]]]
    ]),
    special: lineup("Special appearances", "", "special-appearances", 1009, 1350, [
      [1014, 1075, 709, [[373, "Daddy Yankee"]]],
      [1313, 1341, 733, [[347, "Justice"]]]
    ])
  };

  window.COACHELLA_FULL_POSTER = {
    label: "All 3 days",
    date: "April 9–11 & 16–18",
    image: "assets/full-poster.png",
    width: 1080,
    height: 1350,
    performances: Object.values(window.COACHELLA_LINEUP).flatMap(day =>
      day.performances.map(performance => ({
        ...performance,
        dayLabel: day.label,
        rect: { ...performance.rect, y: performance.rect.y + day.top }
      }))
    )
  };
})();
