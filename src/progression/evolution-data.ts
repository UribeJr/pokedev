/**
 * The central evolution table.
 *
 * One data structure, no switch statements. `EvolutionCondition` is a
 * discriminated union from the outset so that stone, trade, friendship and
 * time-of-day conditions can be added later without touching a single call
 * site - only this table and the one `switch` in `evolution-service.ts` grow.
 *
 * SCOPE OF THIS TABLE (V1)
 * ------------------------
 * Level-up, friendship, and friendship-plus-time-of-day evolutions for
 * Generations 1-4 only.
 *
 * Deliberately NOT encoded yet, because each needs a condition type that does
 * not exist:
 *
 *   - Evolution stones            (Vulpix, Gloom, Poliwhirl, ...)
 *   - Trade evolutions            (Kadabra, Machoke, Graveler, Haunter, ...)
 *   - Trade-with-held-item        (Onix, Seadra, Scyther, Porygon, ...)
 *   - Known-move                  (Aipom, Yanma, Bonsly, Mime Jr., Piloswine)
 *   - Location-based              (Magneton, Nosepass, Leafeon, Glaceon)
 *   - Held item                   (Gligar, Sneasel, Dusclops, Electabuzz, ...)
 *   - Stat- or form-dependent     (Tyrogue, Wurmple, Burmy, Clamperl)
 *   - Extra-slot special cases    (Nincada -> Shedinja)
 *   - Beauty / contest conditions (Feebas -> Milotic)
 *
 * Generation 5 is omitted entirely: only 69 of its 163 species ship sprites in
 * this repository and none of them have shiny variants, so most lines would
 * dead-end mid-evolution or break a shiny partner.
 *
 * Gender and regional forms are encoded as separate rules wherever this
 * repository ships both sprite folders (Nidoran, Gible, Shellos, Hippopotas,
 * Combee), because the species key IS the form here.
 *
 * Every `from` and `to` in this table is asserted to exist in `POKEMON_DATA`
 * by a unit test, which catches both typos and species this repo never
 * shipped.
 *
 * A species may have MORE THAN ONE rule (Eevee -> Espeon by day, Eevee ->
 * Umbreon by night): `evolution-service.ts` indexes rules per species as an
 * ARRAY for exactly this reason, and picks whichever rule's condition is
 * actually satisfied right now rather than the first/last one registered -
 * see `getAvailableEvolution`'s doc comment there for why this matters.
 *
 * Pure: no `vscode`, no DOM.
 */
import { PokemonType } from '../common/types';
import { FRIENDSHIP_EVOLUTION_THRESHOLD } from './friendship-rules';
import { TimeOfDay } from './time-of-day';

export type EvolutionCondition =
  | { type: 'level'; level: number }
  | { type: 'friendship'; minFriendship: number }
  | { type: 'friendship-time'; minFriendship: number; time: TimeOfDay };

export interface EvolutionRule {
  from: PokemonType;
  to: PokemonType;
  condition: EvolutionCondition;
}

/** Terse constructor - this table is long enough without repeated key names. */
function lvl(from: string, to: string, level: number): EvolutionRule {
  return { from, to, condition: { type: 'level', level } };
}

/** Friendship-only evolution, no time-of-day restriction. */
function friend(
  from: string,
  to: string,
  minFriendship: number = FRIENDSHIP_EVOLUTION_THRESHOLD,
): EvolutionRule {
  return { from, to, condition: { type: 'friendship', minFriendship } };
}

/** Friendship evolution that additionally requires a specific time of day. */
function friendTime(
  from: string,
  to: string,
  time: TimeOfDay,
  minFriendship: number = FRIENDSHIP_EVOLUTION_THRESHOLD,
): EvolutionRule {
  return {
    from,
    to,
    condition: { type: 'friendship-time', minFriendship, time },
  };
}

export const EVOLUTION_RULES: readonly EvolutionRule[] = [
  /* ------------------------------ Generation 1 ------------------------------ */
  lvl('bulbasaur', 'ivysaur', 16),
  lvl('ivysaur', 'venusaur', 32),
  lvl('charmander', 'charmeleon', 16),
  lvl('charmeleon', 'charizard', 36),
  lvl('squirtle', 'wartortle', 16),
  lvl('wartortle', 'blastoise', 36),
  lvl('caterpie', 'metapod', 7),
  lvl('metapod', 'butterfree', 10),
  lvl('weedle', 'kakuna', 7),
  lvl('kakuna', 'beedrill', 10),
  lvl('pidgey', 'pidgeotto', 18),
  lvl('pidgeotto', 'pidgeot', 36),
  lvl('rattata', 'raticate', 20),
  lvl('spearow', 'fearow', 20),
  lvl('ekans', 'arbok', 22),
  lvl('nidoran_female', 'nidorina', 16),
  lvl('nidoran_male', 'nidorino', 16),
  lvl('zubat', 'golbat', 22),
  // Golbat -> Crobat is friendship-only, no time-of-day condition.
  friend('golbat', 'crobat'),
  lvl('oddish', 'gloom', 21),
  lvl('paras', 'parasect', 24),
  lvl('venonat', 'venomoth', 31),
  lvl('diglett', 'dugtrio', 26),
  lvl('meowth', 'persian', 28),
  lvl('psyduck', 'golduck', 33),
  lvl('mankey', 'primeape', 28),
  lvl('poliwag', 'poliwhirl', 25),
  lvl('abra', 'kadabra', 16),
  lvl('machop', 'machoke', 28),
  lvl('bellsprout', 'weepinbell', 21),
  lvl('tentacool', 'tentacruel', 30),
  lvl('geodude', 'graveler', 25),
  lvl('ponyta', 'rapidash', 40),
  lvl('slowpoke', 'slowbro', 37),
  lvl('magnemite', 'magneton', 30),
  lvl('doduo', 'dodrio', 31),
  lvl('seel', 'dewgong', 34),
  lvl('grimer', 'muk', 38),
  lvl('gastly', 'haunter', 25),
  lvl('drowzee', 'hypno', 26),
  lvl('krabby', 'kingler', 28),
  lvl('voltorb', 'electrode', 30),
  lvl('cubone', 'marowak', 28),
  lvl('horsea', 'seadra', 32),
  lvl('goldeen', 'seaking', 33),
  lvl('magikarp', 'gyarados', 20),
  lvl('omanyte', 'omastar', 40),
  lvl('kabuto', 'kabutops', 40),
  lvl('dratini', 'dragonair', 30),
  lvl('dragonair', 'dragonite', 55),
  lvl('rhyhorn', 'rhydon', 42),
  // Chansey -> Blissey is friendship-only (Blissey itself is a Gen 2 addition,
  // but Chansey is Gen 1).
  friend('chansey', 'blissey'),
  // Eevee is the one species with two mutually exclusive friendship
  // evolutions, split purely by time of day - see the module doc comment on
  // why a species can have more than one rule.
  friendTime('eevee', 'espeon', 'day'),
  friendTime('eevee', 'umbreon', 'night'),

  /* ------------------------------ Generation 2 ------------------------------ */
  // The Gen 2 "baby" Pokemon: all four are friendship-only, no time-of-day
  // condition.
  friend('pichu', 'pikachu'),
  friend('cleffa', 'clefairy'),
  friend('igglybuff', 'jigglypuff'),
  friend('togepi', 'togetic'),
  lvl('chikorita', 'bayleef', 16),
  lvl('bayleef', 'meganium', 32),
  lvl('cyndaquil', 'quilava', 14),
  lvl('quilava', 'typhlosion', 36),
  lvl('totodile', 'croconaw', 18),
  lvl('croconaw', 'feraligatr', 30),
  lvl('sentret', 'furret', 15),
  lvl('hoothoot', 'noctowl', 20),
  lvl('ledyba', 'ledian', 18),
  lvl('spinarak', 'ariados', 22),
  lvl('chinchou', 'lanturn', 27),
  lvl('natu', 'xatu', 25),
  lvl('mareep', 'flaaffy', 15),
  lvl('flaaffy', 'ampharos', 30),
  lvl('marill', 'azumarill', 18),
  lvl('hoppip', 'skiploom', 18),
  lvl('skiploom', 'jumpluff', 27),
  lvl('wooper', 'quagsire', 20),
  lvl('pineco', 'forretress', 31),
  lvl('snubbull', 'granbull', 23),
  lvl('teddiursa', 'ursaring', 30),
  lvl('slugma', 'magcargo', 38),
  lvl('swinub', 'piloswine', 33),
  lvl('remoraid', 'octillery', 25),
  lvl('houndour', 'houndoom', 24),
  lvl('phanpy', 'donphan', 25),
  lvl('larvitar', 'pupitar', 30),
  lvl('pupitar', 'tyranitar', 55),
  lvl('elekid', 'electabuzz', 30),
  lvl('magby', 'magmar', 30),
  lvl('smoochum', 'jynx', 30),

  /* ------------------------------ Generation 3 ------------------------------ */
  // Friendship-only; distinct from Marill's own level-based evolution into
  // Azumarill (Generation 2, above) - Azurill is Marill's pre-evolution.
  friend('azurill', 'marill'),
  lvl('treecko', 'grovyle', 16),
  lvl('grovyle', 'sceptile', 36),
  lvl('torchic', 'combusken', 16),
  lvl('combusken', 'blaziken', 36),
  lvl('mudkip', 'marshtomp', 16),
  lvl('marshtomp', 'swampert', 36),
  lvl('poochyena', 'mightyena', 18),
  lvl('zigzagoon', 'linoone', 20),
  // Wurmple's split into Silcoon/Cascoon is random and not encoded, but both
  // cocoons evolve on a plain level.
  lvl('silcoon', 'beautifly', 10),
  lvl('cascoon', 'dustox', 10),
  lvl('lotad', 'lombre', 14),
  lvl('seedot', 'nuzleaf', 14),
  lvl('taillow', 'swellow', 22),
  lvl('wingull', 'pelipper', 25),
  lvl('ralts', 'kirlia', 20),
  lvl('kirlia', 'gardevoir', 30),
  lvl('surskit', 'masquerain', 22),
  lvl('shroomish', 'breloom', 23),
  lvl('slakoth', 'vigoroth', 18),
  lvl('vigoroth', 'slaking', 36),
  // Nincada also produces Shedinja in a spare party slot; that half needs a
  // party model this extension does not have.
  lvl('nincada', 'ninjask', 20),
  lvl('whismur', 'loudred', 20),
  lvl('loudred', 'exploud', 40),
  lvl('makuhita', 'hariyama', 24),
  lvl('aron', 'lairon', 32),
  lvl('lairon', 'aggron', 42),
  lvl('meditite', 'medicham', 37),
  lvl('electrike', 'manectric', 26),
  lvl('gulpin', 'swalot', 26),
  lvl('carvanha', 'sharpedo', 30),
  lvl('wailmer', 'wailord', 40),
  lvl('numel', 'camerupt', 33),
  lvl('spoink', 'grumpig', 32),
  lvl('trapinch', 'vibrava', 35),
  lvl('vibrava', 'flygon', 45),
  lvl('cacnea', 'cacturne', 32),
  lvl('swablu', 'altaria', 35),
  lvl('barboach', 'whiscash', 30),
  lvl('corphish', 'crawdaunt', 30),
  lvl('baltoy', 'claydol', 36),
  lvl('lileep', 'cradily', 40),
  lvl('anorith', 'armaldo', 40),
  lvl('shuppet', 'banette', 37),
  lvl('duskull', 'dusclops', 37),
  lvl('snorunt', 'glalie', 42),
  lvl('spheal', 'sealeo', 32),
  lvl('sealeo', 'walrein', 44),
  lvl('bagon', 'shelgon', 30),
  lvl('shelgon', 'salamence', 50),
  lvl('beldum', 'metang', 20),
  lvl('metang', 'metagross', 45),

  /* ------------------------------ Generation 4 ------------------------------ */
  // Friendship-only.
  friend('buneary', 'lopunny'),
  // Friendship plus time-of-day.
  friendTime('budew', 'roselia', 'day'),
  friendTime('chingling', 'chimecho', 'night'),
  friendTime('riolu', 'lucario', 'day'),
  lvl('turtwig', 'grotle', 18),
  lvl('grotle', 'torterra', 32),
  lvl('chimchar', 'monferno', 14),
  lvl('monferno', 'infernape', 36),
  lvl('piplup', 'prinplup', 16),
  lvl('prinplup', 'empoleon', 36),
  lvl('starly', 'staravia', 14),
  lvl('staravia', 'staraptor', 34),
  lvl('bidoof', 'bibarel', 15),
  lvl('kricketot', 'kricketune', 10),
  lvl('shinx', 'luxio', 15),
  lvl('luxio', 'luxray', 30),
  lvl('cranidos', 'rampardos', 30),
  lvl('shieldon', 'bastiodon', 30),
  // Only female Combee evolve.
  lvl('combee_female', 'vespiquen', 21),
  lvl('buizel', 'floatzel', 26),
  lvl('cherubi', 'cherrim', 25),
  lvl('shellos_east', 'gastrodon_east', 30),
  lvl('shellos_west', 'gastrodon_west', 30),
  lvl('drifloon', 'drifblim', 28),
  lvl('glameow', 'purugly', 38),
  lvl('stunky', 'skuntank', 34),
  lvl('bronzor', 'bronzong', 33),
  lvl('gible', 'gabite', 24),
  lvl('gabite', 'garchomp', 48),
  lvl('gible_female', 'gabite_female', 24),
  lvl('gabite_female', 'garchomp_female', 48),
  lvl('hippopotas_male', 'hippowdon_male', 34),
  lvl('hippopotas_female', 'hippowdon_female', 34),
  lvl('skorupi', 'drapion', 40),
  lvl('croagunk', 'toxicroak', 37),
  lvl('finneon', 'lumineon', 31),
  lvl('snover', 'abomasnow', 40),
];
