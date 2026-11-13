(() => {
  const p = (name, stage, start, end, aliases = []) => ({ name, stage, start, end, aliases });

  window.ACL_SCHEDULES = {
    "1": {
      label: "Weekend 1",
      days: {
        friday: {
          label: "Friday",
          date: "October 2",
          image: "assets/friday-w1.png",
          performances: [
            p("Asleep at the Wheel",0,"1:00 PM","1:45 PM"),
            p("New Constellations",0,"2:30 PM","3:15 PM"),
            p("Jesse Welles",0,"4:15 PM","5:15 PM"),
            p("Turnstile",0,"6:15 PM","7:15 PM"),
            p("Skrillex",0,"8:15 PM","9:45 PM"),

            p("Faouzia",1,"1:45 PM","2:30 PM"),
            p("Paris Paloma",1,"3:15 PM","4:15 PM"),
            p("Brandon Flowers",1,"5:15 PM","6:15 PM"),
            p("Leon Thomas",1,"7:15 PM","8:15 PM"),

            p("Elle Coves",2,"1:45 PM","2:30 PM"),
            p("Izzy Escobar",2,"3:30 PM","4:15 PM"),
            p("Grocery Bag",2,"5:15 PM","6:15 PM"),

            p("Night Traveler",3,"2:00 PM","2:45 PM"),
            p("Marlon Funaki",3,"3:30 PM","4:30 PM"),
            p("Pusowsky",3,"5:30 PM","6:30 PM"),
            p("Molly Santana",3,"7:30 PM","8:30 PM"),

            p("The 4411",4,"12:45 PM","1:30 PM"),
            p("Solomon Hicks",4,"2:00 PM","2:45 PM"),
            p("Bo Staloch",4,"3:15 PM","4:00 PM"),
            p("Rebecca Black",4,"4:30 PM","5:30 PM"),
            p("Steve Aoki",4,"6:30 PM","7:30 PM"),

            p("Elijah Delgado",5,"2:00 PM","2:45 PM"),
            p("LP",5,"3:30 PM","4:30 PM"),
            p("BUNT.",5,"5:30 PM","6:30 PM",["BUNT"]),
            p("The Chainsmokers",5,"7:30 PM","8:30 PM"),

            p("Hunx and His Punx",7,"1:15 PM","2:00 PM"),
            p("CMAT",7,"2:45 PM","3:30 PM"),
            p("Amyl and the Sniffers",7,"4:30 PM","5:30 PM"),
            p("Labrinth",7,"6:30 PM","7:30 PM"),
            p("Charli XCX",7,"8:35 PM","9:45 PM")
          ]
        },
        saturday: {
          label: "Saturday",
          date: "October 3",
          image: "assets/saturday-w1.png",
          performances: [
            p("Night Tapes",0,"1:00 PM","1:45 PM"),
            p("Balu Brigada",0,"2:30 PM","3:15 PM"),
            p("Suki Waterhouse",0,"4:15 PM","5:15 PM"),
            p("Bleachers",0,"6:15 PM","7:15 PM"),
            p("Lorde",0,"8:15 PM","9:45 PM"),

            p("Temper City",1,"1:45 PM","2:30 PM"),
            p("Arcy Drive",1,"3:15 PM","4:15 PM"),
            p("Palace",1,"5:15 PM","6:15 PM"),
            p("Levity",1,"7:15 PM","8:15 PM"),

            p("Fightmaster",2,"12:45 PM","1:15 PM"),
            p("Emma Ogier",2,"1:45 PM","2:30 PM"),
            p("Coleman Jennings",2,"3:30 PM","4:15 PM"),
            p("Fai Laci",2,"5:15 PM","6:15 PM"),

            p("Cure for Paranoia",3,"3:30 PM","4:15 PM"),
            p("Ryan Beatty",3,"5:30 PM","6:30 PM"),
            p("Snow Strippers",3,"7:30 PM","8:10 PM"),

            p("Left Lucid",4,"12:45 PM","1:30 PM"),
            p("DJ Cassandra",4,"2:00 PM","2:45 PM",["Cassandra"]),
            p("Don West",4,"3:15 PM","4:00 PM"),
            p("Rodrigo y Gabriela",4,"4:30 PM","5:30 PM"),
            p("Yousuke Yukimatsu",4,"6:30 PM","7:30 PM",["¥ØU$UK€ ¥UK1MAT$U","Yousuke Yukimatsu"]),

            p("Rochelle Jordan",5,"2:00 PM","2:45 PM"),
            p("Skye Newman",5,"3:30 PM","4:30 PM"),
            p("It's Murph",5,"5:30 PM","6:30 PM"),
            p("Lykke Li",5,"7:30 PM","8:30 PM"),

            p("Annie DiRusso",7,"1:15 PM","2:00 PM"),
            p("Finn Wolfhard",7,"2:45 PM","3:30 PM"),
            p("Young Miko",7,"4:30 PM","5:30 PM"),
            p("Lola Young",7,"6:30 PM","7:30 PM"),
            p("RÜFÜS DU SOL",7,"8:30 PM","9:45 PM",["Rufus Du Sol"])
          ]
        },
        sunday: {
          label: "Sunday",
          date: "October 4",
          image: "assets/sunday-w1.png",
          performances: [
            p("Solya",0,"1:15 PM","2:00 PM"),
            p("Stella Lefty",0,"2:45 PM","3:30 PM"),
            p("Audrey Hobert",0,"4:30 PM","5:20 PM"),
            p("Geese",0,"6:20 PM","7:20 PM"),
            p("The xx",0,"8:35 PM","9:45 PM"),

            p("Jess Williamson",1,"2:00 PM","2:45 PM"),
            p("Claire Rosinkranz",1,"3:30 PM","4:30 PM"),
            p("Saint Motel",1,"5:20 PM","6:20 PM"),
            p("Parcels",1,"7:20 PM","8:35 PM"),

            p("Vinny",2,"12:45 PM","1:15 PM"),
            p("Aaron Rowe",2,"2:00 PM","2:45 PM"),
            p("Fancy Hagood",2,"3:30 PM","4:15 PM"),
            p("Lauren Sanderson",2,"5:30 PM","6:30 PM"),

            p("Flight By Nothing",3,"2:00 PM","2:45 PM"),
            p("underscores",3,"3:30 PM","4:30 PM"),
            p("Noga Erez",3,"5:30 PM","6:30 PM"),
            p("Blood Orange",3,"7:30 PM","8:30 PM"),

            p("The Moriah Sisters",4,"12:45 PM","1:30 PM"),
            p("GIRLSWEETVOICED",4,"2:00 PM","2:45 PM",["girlsweetvoiced"]),
            p("Calder Allen",4,"3:15 PM","4:00 PM"),
            p("Rio Kosta",4,"4:30 PM","5:30 PM"),
            p("FCUKERS",4,"6:30 PM","7:30 PM",["Fcukers"]),

            p("Sunday (1994)",5,"2:00 PM","2:45 PM"),
            p("Britton",5,"3:30 PM","4:30 PM"),
            p("Cannons",5,"5:30 PM","6:30 PM"),
            p("The War on Drugs",5,"7:30 PM","8:30 PM"),

            p("Villanelle",7,"1:15 PM","2:00 PM"),
            p("Dexter and the Moonrocks",7,"2:45 PM","3:30 PM"),
            p("Max McNown",7,"4:30 PM","5:30 PM"),
            p("SOFI TUKKER",7,"6:30 PM","7:30 PM",["Sofi Tukker"]),
            p("Twenty One Pilots",7,"8:30 PM","9:45 PM")
          ]
        }
      }
    },

    "2": {
      label: "Weekend 2",
      days: {
        friday: {
          label: "Friday",
          date: "October 9",
          image: "assets/friday-w2.png",
          performances: [
            p("Happy Landing",0,"1:00 PM","1:45 PM"),
            p("Bella Kay",0,"2:30 PM","3:15 PM"),
            p("Jesse Welles",0,"4:15 PM","5:15 PM"),
            p("Turnstile",0,"6:15 PM","7:15 PM"),
            p("Kings of Leon",0,"8:15 PM","9:45 PM"),

            p("Radio Free Alice",1,"1:45 PM","2:30 PM"),
            p("Sienna Spiro",1,"3:30 PM","4:15 PM"),
            p("Paris Paloma",1,"5:15 PM","6:15 PM"),
            p("Leon Thomas",1,"7:15 PM","8:15 PM"),

            p("Leon Knight",2,"1:45 PM","2:30 PM"),
            p("Girlfriend",2,"3:30 PM","4:15 PM"),
            p("Joe Jordan",2,"5:15 PM","6:15 PM"),

            p("S.G. Goodman",3,"2:00 PM","2:45 PM"),
            p("World Famous Pets",3,"3:30 PM","4:30 PM"),
            p("Pusowsky",3,"5:30 PM","6:30 PM"),
            p("Live",3,"7:30 PM","8:30 PM"),

            p("Almost Heaven",4,"12:45 PM","1:30 PM"),
            p("Cassandra Coleman",4,"2:00 PM","2:45 PM"),
            p("Bo Staloch",4,"3:15 PM","4:00 PM"),
            p("Natasha Bedingfield",4,"4:30 PM","5:30 PM"),
            p("Steve Aoki",4,"6:30 PM","7:30 PM"),

            p("Dallas Wax",5,"2:00 PM","2:45 PM"),
            p("LP",5,"3:30 PM","4:30 PM"),
            p("BUNT.",5,"5:30 PM","6:30 PM",["BUNT"]),
            p("The Chainsmokers",5,"7:30 PM","8:30 PM"),

            p("Brigitte Calls Me Baby",7,"1:15 PM","2:00 PM"),
            p("Faouzia",7,"2:45 PM","3:30 PM"),
            p("Amyl and the Sniffers",7,"4:30 PM","5:30 PM"),
            p("Labrinth",7,"6:30 PM","7:30 PM"),
            p("Charli XCX",7,"8:35 PM","9:45 PM")
          ]
        },
        saturday: {
          label: "Saturday",
          date: "October 10",
          image: "assets/saturday-w2.png",
          performances: [
            p("Night Tapes",0,"1:00 PM","1:45 PM"),
            p("Balu Brigada",0,"2:30 PM","3:15 PM"),
            p("Suki Waterhouse",0,"4:15 PM","5:15 PM"),
            p("Bleachers",0,"6:15 PM","7:15 PM"),
            p("Lorde",0,"8:15 PM","9:45 PM"),

            p("Temper City",1,"1:45 PM","2:30 PM"),
            p("ŁASZEWO",1,"3:15 PM","4:15 PM",["Laszewo"]),
            p("Arcy Drive",1,"5:15 PM","6:15 PM"),
            p("Levity",1,"7:15 PM","8:15 PM"),

            p("Macy Todd",2,"12:45 PM","1:15 PM"),
            p("Damaris Bojor",2,"1:45 PM","2:30 PM"),
            p("Common People",2,"3:30 PM","4:15 PM"),
            p("Chloe Qisha",2,"5:15 PM","6:15 PM"),

            p("Lluvi",3,"3:30 PM","4:15 PM"),
            p("Ryan Beatty",3,"5:30 PM","6:30 PM"),
            p("Snow Strippers",3,"7:30 PM","8:10 PM"),

            p("Montclair",4,"12:45 PM","1:30 PM"),
            p("DJ Cassandra",4,"2:00 PM","2:45 PM",["Cassandra"]),
            p("Don West",4,"3:15 PM","4:00 PM"),
            p("Rodrigo y Gabriela",4,"4:30 PM","5:30 PM"),
            p("Yousuke Yukimatsu",4,"6:30 PM","7:30 PM",["¥ØU$UK€ ¥UK1MAT$U","Yousuke Yukimatsu"]),

            p("Gabriel Jacoby",5,"2:00 PM","2:45 PM"),
            p("Skye Newman",5,"3:30 PM","4:30 PM"),
            p("It's Murph",5,"5:30 PM","6:30 PM"),
            p("Lykke Li",5,"7:30 PM","8:30 PM"),

            p("Annie DiRusso",7,"1:15 PM","2:00 PM"),
            p("Finn Wolfhard",7,"2:45 PM","3:30 PM"),
            p("Young Miko",7,"4:30 PM","5:30 PM"),
            p("Lola Young",7,"6:30 PM","7:30 PM"),
            p("RÜFÜS DU SOL",7,"8:30 PM","9:45 PM",["Rufus Du Sol"])
          ]
        },
        sunday: {
          label: "Sunday",
          date: "October 11",
          image: "assets/sunday-w2.png",
          performances: [
            p("Thomas Day",0,"1:15 PM","2:00 PM"),
            p("Charlotte Lawrence",0,"2:45 PM","3:30 PM"),
            p("Audrey Hobert",0,"4:30 PM","5:20 PM"),
            p("Geese",0,"6:20 PM","7:20 PM"),
            p("The xx",0,"8:35 PM","9:45 PM"),

            p("Joshua Jensen",1,"2:00 PM","2:45 PM"),
            p("Claire Rosinkranz",1,"3:30 PM","4:30 PM"),
            p("Saint Motel",1,"5:20 PM","6:20 PM"),
            p("Parcels",1,"7:20 PM","8:35 PM"),

            p("MARZZ",2,"12:45 PM","1:15 PM",["Marzz"]),
            p("Chelsea Jordan",2,"2:15 PM","2:45 PM"),
            p("VWILLZ",2,"3:30 PM","4:15 PM",["Vwillz"]),
            p("Jason Scott & The High Heat",2,"6:00 PM","6:30 PM"),

            p("Kevin Atwater",3,"2:00 PM","2:45 PM"),
            p("Bad Nerves",3,"3:30 PM","4:30 PM"),
            p("Noga Erez",3,"5:30 PM","6:30 PM"),
            p("Blood Orange",3,"7:30 PM","8:30 PM"),

            p("Huston-Tillotson University Jazz Collective",4,"12:45 PM","1:30 PM"),
            p("GIRLSWEETVOICED",4,"2:00 PM","2:45 PM",["girlsweetvoiced"]),
            p("Calder Allen",4,"3:15 PM","4:00 PM"),
            p("Rio Kosta",4,"4:30 PM","5:30 PM"),
            p("FCUKERS",4,"6:30 PM","7:30 PM",["Fcukers"]),

            p("Sunday (1994)",5,"2:00 PM","2:45 PM"),
            p("Grace Ives",5,"3:30 PM","4:30 PM"),
            p("Houndmouth",5,"5:30 PM","6:30 PM"),
            p("The War on Drugs",5,"7:30 PM","8:30 PM"),

            p("Rum Jungle",7,"1:15 PM","2:00 PM"),
            p("Ethan Regan",7,"2:45 PM","3:30 PM"),
            p("Max McNown",7,"4:30 PM","5:30 PM"),
            p("SOFI TUKKER",7,"6:30 PM","7:30 PM",["Sofi Tukker"]),
            p("Twenty One Pilots",7,"8:30 PM","9:45 PM")
          ]
        }
      }
    }
  };
})();
