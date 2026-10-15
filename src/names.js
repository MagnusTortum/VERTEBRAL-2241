// Names for buildings. Every building gets one from its kind, origin (new / pre-war / pre-war + new), size and
// the town's wealth; a family keeps one surname per plot (Casa Ochoa, Abarrotes Ochoa next door). Pre-war
// buildings put to a new use keep the faded old name too. Stable: seeded by the building id (+ nameV, the reroll
// count); a name typed in the inspector (spec.name) always wins. Generic Baja / northwest Mexican usage, no
// real businesses or people.
import { RNG } from './rng.js';

// surnames, weighted toward the northwest (Sinaloa / Sonora / the Baja peninsula)
export const SURNAMES = ['García', 'Hernández', 'López', 'Martínez', 'González', 'Rodríguez', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales', 'Reyes', 'Gutiérrez', 'Ortiz', 'Ruiz',
  'Castro', 'Valenzuela', 'Ochoa', 'Félix', 'Lizárraga', 'Higuera', 'Meza', 'Zazueta', 'Murillo', 'Armenta', 'Beltrán', 'Bojórquez', 'Camacho', 'Soto', 'Verdugo', 'Gastélum', 'Osuna', 'Peralta', 'Romero', 'Espinoza',
  'Cota', 'Arce', 'Aguilar', 'Amador', 'Duarte', 'Moreno', 'Leyva', 'Quintero', 'Villegas', 'Mendoza', 'Salazar', 'Vázquez', 'Jiménez', 'Ramos', 'Medina', 'Castillo', 'Navarro', 'Rosas', 'Núñez', 'Ibarra',
  'Acosta', 'Valdez', 'Rentería', 'Sotelo', 'Inzunza', 'Urías', 'Angulo', 'Sauceda', 'Lugo', 'Ojeda', 'Avilés', 'Cárdenas', 'Robles', 'Montaño', 'Ceseña', 'Geraldo', 'Liera', 'Aispuro', 'Manríquez', 'Arámburo',
  'Talamantes', 'Burgoin', 'Davis', 'Smith', 'Collins', 'Almaraz', 'Trasviña', 'Cosío', 'Agúndez', 'Marrón', 'Olachea', 'Mayoral', 'Pedrín', 'Romo', 'Fuerte', 'Sández', 'Villavicencio', 'Bastida',
  'Acuña', 'Alcaraz', 'Alvarado', 'Andrade', 'Anaya', 'Arredondo', 'Ávila', 'Baca', 'Barajas', 'Barraza', 'Bermúdez', 'Bustamante', 'Cabrera', 'Calderón', 'Campos', 'Carrillo', 'Cázares', 'Cervantes', 'Chávez', 'Contreras',
  'Corral', 'Cuevas', 'Delgado', 'Domínguez', 'Escobar', 'Escalante', 'Esquer', 'Estrada', 'Fierro', 'Figueroa', 'Galindo', 'Gallardo', 'Gamboa', 'Garibay', 'Gil', 'Guerrero', 'Guzmán', 'Herrera', 'Hinojosa', 'Huerta',
  'Iribe', 'Jáuregui', 'Lara', 'Ledezma', 'León', 'Loaiza', 'Lomelí', 'Lucero', 'Luna', 'Macías', 'Maldonado', 'Márquez', 'Mejía', 'Miranda', 'Molina', 'Montes', 'Montoya', 'Mora', 'Muñoz', 'Nava',
  'Noriega', 'Orozco', 'Ortega', 'Padilla', 'Palomares', 'Parra', 'Paz', 'Pacheco', 'Pineda', 'Ponce', 'Quiñones', 'Rascón', 'Rendón', 'Ríos', 'Rocha', 'Rojas', 'Salas', 'Salcido', 'Sandoval', 'Santana',
  'Serrano', 'Sierra', 'Solís', 'Tapia', 'Tirado', 'Trujillo', 'Uribe', 'Valle', 'Vega', 'Velázquez', 'Vidaurri', 'Yáñez', 'Zamora', 'Zavala', 'Zepeda', 'Zúñiga', 'Encinas', 'Gaxiola', 'Moroyoqui', 'Valdivia'];
const MALE = ['José', 'Juan', 'Jesús', 'Manuel', 'Francisco', 'Antonio', 'Pedro', 'Ramón', 'Rafael', 'Miguel', 'Luis', 'Carlos', 'Javier', 'Raúl', 'Arturo', 'Rubén', 'Ignacio', 'Lorenzo', 'Alberto', 'Héctor', 'Fidel', 'Ernesto', 'Teodoro', 'Saúl', 'Efraín', 'Rigoberto', 'Abel', 'Ismael', 'Lauro', 'Isidro'];
const FEMALE = ['María', 'Guadalupe', 'Rosa', 'Teresa', 'Carmen', 'Dolores', 'Graciela', 'Margarita', 'Rosario', 'Josefina', 'Esperanza', 'Leticia', 'Elena', 'Socorro', 'Amparo', 'Consuelo', 'Martha', 'Irma', 'Yolanda', 'Alma', 'Ofelia', 'Refugio', 'Concepción', 'Celia', 'Herminia'];
const NICK = { José: 'Pepe', Jesús: 'Chuy', Francisco: 'Pancho', Antonio: 'Toño', Ignacio: 'Nacho', Lorenzo: 'Lencho', Alberto: 'Beto', Manuel: 'Meño', Ramón: 'Moncho', Rafael: 'Rafa', Javier: 'Javi', Guadalupe: 'Lupe', Rosario: 'Chayo', Dolores: 'Lola', Graciela: 'Chela', Teresa: 'Tere', Concepción: 'Conchita', Socorro: 'Coco', Refugio: 'Cuca', Josefina: 'Chepina', Margarita: 'Maggie', Rosa: 'Rosy' };
const NICKS = ['El Güero', 'El Chato', 'El Flaco', 'El Gordo', 'El Negro', 'El Chino', 'El Tuerto', 'La Güera', 'La Flaca', 'La Chata', 'El Compa', 'El Viejo', 'El Mocho', 'El Chapo', 'Che Guevara', 'El Pelón', 'La Chaparra'];
const SAINTS = ['San Judas', 'San José', 'San Martín', 'San Antonio', 'San Pedro', 'San Juan', 'San Francisco', 'San Miguel', 'San Rafael', 'San Isidro', 'San Telmo', 'San Ignacio', 'San Lucas', 'San Felipe', 'Santa Rosalía', 'Santa Rita', 'Santa Cecilia', 'Santa Ana', 'Santa Clara', 'Santa Inés', 'Santo Tomás', 'Santo Niño', 'La Guadalupana', 'Las Ánimas'];
const THINGS = ['El Coyote', 'La Gaviota', 'El Venado', 'La Paloma', 'El Alacrán', 'El Gallo', 'La Sirena', 'El Faro', 'La Perla', 'El Nopal', 'La Palma', 'El Oasis', 'La Brisa', 'El Mezquite', 'La Ballena', 'El Tiburón', 'La Garza',
  'El Halcón', 'La Tortuga', 'El Cardón', 'La Luna', 'El Sol', 'La Estrella', 'El Ancla', 'La Concha', 'El Cuervo', 'La Lagartija', 'El Toro', 'La Golondrina', 'El Correcaminos', 'La Biznaga', 'El Ocotillo', 'La Pitaya', 'El Huizache', 'La Ola', 'El Arenal', 'La Loma', 'El Llano', 'La Cañada', 'El Puerto'];
const FEELINGS = ['La Esperanza', 'La Fe', 'La Providencia', 'La Fortuna', 'La Paz', 'La Unión', 'La Victoria', 'El Progreso', 'La Amistad', 'La Bendición', 'El Porvenir', 'La Constancia', 'El Triunfo', 'La Alegría', 'El Buen Gusto'];
const WASTE = ['La Última Gota', 'El Refugio', 'Agua Limpia', 'El Sobreviviente', 'La Resistencia', 'El Fin del Mundo', 'Todo Se Acaba', 'El Polvo', 'La Segunda Vuelta', 'Sin Lluvia', 'El Hongo', 'Después del Fuego', 'La Calma'];
// the wasteland's own humour: atomic-age leftovers, two-headed cattle, bad luck taken in stride (classic Fallout jazz, a
// little gonzo) — generic, no brand names
const GONZO = {
  any: ['El Hongo Alegre', 'La Mutante Bonita', 'El Contador Geiger', 'La Res de Dos Cabezas', 'El Fin del Mundo', 'Sin Futuro', 'Ya Ni Modo', 'Quién Sabe', 'Lo Que Quede', 'El Átomo Feliz', 'La Lluvia Ácida',
    'Mañana Será Peor', 'El Sobrino del Apocalipsis', 'La Cucaracha Gigante', 'El Brillo Verde', 'Radiación Cero (Casi)', 'El Rayo Atómico', 'La Bomba Que No Cayó', 'El Último Optimista', 'La Tercera Cabeza', 'El Cráter',
    'Dos Soles', 'La Nube Rosa', 'El Escorpión Radiactivo', 'La Iguana Radiante', 'El Robot Cansado', 'El Desierto Amable',
    'El Mañana Que Nunca Llegó', 'La Lagartija de Tres Ojos', 'El Coyote Fosforescente', 'La Sirena Mutante', 'El Polvo Dorado', 'El Gallo Sin Cabeza', 'La Gaviota Calva', 'El Zopilote Feliz', 'La Última Lata', 'El Bunker del Pueblo',
    'El Ojo Extra', 'La Suerte Brillante', 'El Chapulín Gigante', 'La Chatarra Fina', 'El Robot Llorón', 'La Brújula Loca', 'El Sol Verde', 'La Tormenta Roja', 'El Profeta Borracho', 'La Esperanza Oxidada',
    'El Hongo Grande', 'La Paz Radiactiva', 'Cero Grados de Normal', 'El Milagro de Lata', 'El Mundo al Revés', 'La Gloria Tibia', 'El Vecino Raro'],
  cantina: ['Cantina El Hongo Alegre', 'Bar Sin Futuro', 'El Último Trago Antes del Fin', 'Cantina Contador Geiger', 'La Cruda Atómica', 'Bar La Mutante Bonita', 'Salón Átomo', 'Pulquería El Apocalipsis Chiquito', 'Cantina Ya Ni Modo', 'El Vaso Medio Radiactivo',
    'Cantina El Fin Se Celebra', 'Bar El Tercer Ojo', 'El Mezcal Que Brilla', 'Cantina El Zopilote Feliz', 'Bar La Lluvia Ácida', 'La Botella del Profeta', 'Cantina Hasta que Explote', 'El Cuervo Sediento', 'Bar Dos Cabezas, Un Trago', 'La Resaca del Siglo'],
  cafe: ['Fonda Dos Cabezas', 'Tacos de Iguana Radiante', 'Lonchería La Cucaracha Gigante', 'Comedor El Brillo Verde', 'Fonda Coma Ahora, Muera Después', 'Birria de Res de Dos Cabezas', 'Comida Casi Fresca', 'Caldo Atómico',
    'Lonchería La Lata Feliz', 'Fonda Pregunte Qué Es', 'Tacos El Escorpión', 'Comedor Hoy Sí Hay', 'Mariscos La Sirena Mutante', 'Fonda Sabor del Ayer', 'Tortas El Chapulín Gigante', 'Pozole Rad-Libre'],
  shop: ['Abarrotes Atómicos', 'Miscelánea Ya Ni Modo', 'La Tienda que Sobrevivió', 'Abarrotes Quién Sabe', 'Todo a Una Chapa', 'Compra-Venta Lo Que Quede', 'Miscelánea Fin del Mundo', 'Depósito El Rad-Barato',
    'Abarrotes El Búnker', 'Miscelánea Todo Sirve', 'Tienda El Fin de Mes Eterno', 'Abarrotes La Última Lata', 'Trueque y Trueque', 'Miscelánea No Preguntes', 'Abarrotes La Suerte Brillante', 'Compro Chatarra, Vendo Esperanza'],
  posada: ['Motel Fin del Mundo', 'Posada Dormir Es Gratis (No)', 'Hotel Rayo Atómico', 'Casa de Huéspedes Los Sobrevivientes', 'Motel Dos Soles', 'Posada El Último Optimista',
    'Motel Duerme Si Puedes', 'Posada La Cama Sin Bichos (Casi)', 'Hotel El Mañana Que Nunca Llegó', 'Casa de Huéspedes El Vecino Raro', 'Motel La Brújula Loca', 'Mesón El Polvo Dorado'],
  clinic: ['Clínica Sin Garantía', 'Consultorio Rad-Fuera', 'Dispensario Ojalá', 'Enfermería Tres Brazos Bienvenidos', 'Clínica El Milagro Dudoso',
    'Consultorio Dr. Quién Sabe', 'Clínica Ponte Bien (o No)', 'Dispensario El Ojo Extra', 'Enfermería La Gloria Tibia', 'Clínica Cero Grados de Normal'],
  workshop: ['Taller El Robot Cansado', 'Taller Lo Que Quede', 'Herrería Chatarra Fina', 'Soldaduras El Cráter', 'Reparaciones Casi Todo',
    'Taller El Robot Llorón', 'Herrería El Milagro de Lata', 'Taller Si Funciona No lo Toques', 'Reparaciones El Mundo al Revés', 'Soldaduras La Chispa Final'],
  garage: ['Talachas Fin del Camino', 'Taller Mecánico Rueda Que Rueda', 'Llantera El Cráter', 'Autopartes Del Ayer',
    'Talachas El Zopilote', 'Taller Mecánico Rueda Cuadrada', 'Llantera La Ponchada Eterna', 'Autopartes Del Fin del Mundo'],
  house: ['Casa del Mutante', 'Búnker de los {S}', 'Casa Todavía en Pie', 'El Refugio de los {S}', 'Casa Dos Cabezas',
    'Casa Aguanta Vara', 'Fortín de los {S}', 'Casa Sin Ventanas', 'La Madriguera de los {S}', 'Casa del Vecino Raro'],
};
const ATOMIC_OLD = ['Farmacia Atómica', 'Supermercado El Mañana', 'Autocinema del Futuro', 'Motel Rayo Atómico', 'Banco del Porvenir Nuclear', 'Electrodomésticos La Era Atómica', 'Refugio Antiaéreo Municipal', 'Cafetería Cohete',
  'Agencia de Robots Domésticos', 'Gasolinera Fusión', 'Lavandería Radiante', 'Escuela Técnica de Energía Nuclear', 'Distribuidora de Refrescos Atómicos', 'Club de Leones del Mañana',
  'Salón de Belleza Siglo XXI', 'Boliche Órbita', 'Heladería Polo Atómico', 'Televisores El Porvenir', 'Ferretería El Hogar Nuclear', 'Fuente de Sodas Satélite', 'Abarrotes Supermoderno', 'Mueblería Plástico del Mañana',
  'Oficina de Defensa Civil', 'Agencia de Autos Cohete', 'Laboratorio de Análisis Isótopo', 'Cine Galaxia', 'Banco de Ahorro Atómico', 'Escuela de Mecanografía Futura'];
const FEM_NOUN = ['Rosita', 'Lupita', 'Chayito', 'Juanita', 'Conchita', 'Carmelita', 'Tere', 'Lolita', 'Panchita', 'Cuquita'];

const pickName = (r, fem) => r.pick(fem ? FEMALE : MALE);
const nick = (r, fem) => { const n = pickName(r, fem); return NICK[n] && r.chance(0.6) ? NICK[n] : n; };
// the people on the edge of town, as the town calls them
export const EDGE_NICKS = ['Gordito', 'Pablo Picasso', 'Salamandra', 'Tortuga', 'El Puto', 'Tres Dedos', 'Pepe Radiación', 'Chuy Dos Caras', 'La Momia', 'Doña Cucaracha', 'El Zopilote', 'Medio Pollo', 'Tío Gusano', 'Panchito Chatarra', 'Lupe la Tuerta', 'El Bombón', 'Cara de Llanta', 'Juanito Tuercas', 'El Profe', 'Abuela Papi Cola', 'Chato Diésel', 'La Iguana', 'El Mago', 'Tito Tétanos', 'Don Ratón', 'El Calavera', 'Mamá Escorpión', 'Chispas', 'El Sordo', 'Manos de Piedra', 'Pata de Palo', 'Lalo Lagartija', 'Güero Brillante', 'Paco Pólvora', 'La Gata Flaca', 'Ojo Loco', 'Sin Dientes', 'Pepe el Toro', 'Cantinflas', 'Pancho Villa', 'El Cabezón', 'Nacho Lámpara', 'Tía Mutante', 'Beto Bombas', 'Chencha la Bruja', 'Coyote Pérez', 'Pancho Tranquilo', 'El Tlacuache', 'Lencho Latas', 'Garrapata', 'Maclovio Hongos', 'Toño Tormentas', 'Cuca Cuervo', 'El Ajolote', 'Don Nadie', 'La Diabla', 'Memo Mostaza', 'El Vampiro', 'Rata Flaca', 'Santo Remedio'];
const plural = (s) => s; // surnames stay as they are after "los": los García, los Ochoa
const place = (r) => r.weighted({ thing: 4, saint: 2, feel: 2, waste: 0.7 });
const flav = (r) => { const k = place(r); return k === 'thing' ? r.pick(THINGS) : k === 'saint' ? r.pick(SAINTS) : k === 'feel' ? r.pick(FEELINGS) : r.pick(WASTE); };
const W = (r, opts) => { const k = r.weighted(Object.fromEntries(opts.map((o, i) => [i, o[0]]))); return opts[k][1](); };

// what a pre-war building was, before (faded paint over the door)
function prewarName(r, sur) {
  return W(r, [
    [2, () => `Farmacia ${r.pick([...SAINTS, sur])}`], [2, () => `Ferretería ${sur}`], [1.5, () => `Papelería ${r.pick(THINGS)}`], [1.2, () => `Zapatería ${sur}`], [1.5, () => `Refaccionaria ${sur}`],
    [1, () => `Lavandería ${r.pick(FEELINGS)}`], [1, () => `Mueblería ${sur}`], [0.8, () => `Óptica ${sur}`], [0.8, () => `Cine ${r.pick(['Variedades', 'Royal', 'Rex', 'Imperial', 'Avenida', 'Sonora'])}`],
    [1.2, () => `Hotel ${r.pick(['Central', 'del Valle', 'Plaza', 'Imperial', 'Los Arcos', 'Del Mar'])}`], [1, () => `Oficina de Correos`], [1, () => `Escuela Primaria Federal No. ${r.int(3, 48)}`],
    [1, () => `Banco ${r.pick(['Agrícola', 'Regional', 'del Noroeste', 'Ganadero'])}`], [1.2, () => `Mercado ${r.pick(['Municipal', 'Juárez', 'Hidalgo', 'Central'])}`], [0.8, () => `Agencia ${r.pick(['Agrícola', 'de Viajes', 'Aduanal'])}`],
    [1, () => `Cooperativa Pesquera ${r.pick(FEELINGS)}`], [3, () => r.pick(ATOMIC_OLD)], [1, () => `Centro de Salud`], [0.8, () => `Bodega Rural Ejidal`], [1, () => `Taller Eléctrico ${sur}`],
  ]);
}

// the name for a building spec. ctx: { surname (the plot's family), wealth (0..4), prewarUse (true: pre-war shell, new use) }
export function nameFor(spec, ctx = {}) {
  const r = new RNG(`name:${spec.id}:${spec.nameV || 0}`);
  const sur = ctx.surname || r.pick(SURNAMES), kind = spec.kind || 'house', fl = spec.floors || 1, big = (spec.size?.[0] || 8) * (spec.size?.[1] || 8) > 140;
  const wealth = ctx.wealth ?? 1, prewar = spec.origin === 'prewar' || spec.origin === 'maintained' || spec.origin === 'repurposed', ruin = ['ruin', 'stripped'].includes(spec.origin) || (spec.condition != null && spec.condition < 0.45);
  const fem = r.chance(0.5), owner = () => (fem ? `Doña ${nick(r, true)}` : `Don ${nick(r, false)}`);
  let name;
  switch (kind) {
    case 'house': {
      const opts = [[5, () => `Casa ${sur}`], [2, () => `Casa de los ${plural(sur)}`], [1.2, () => `Familia ${sur}`], [1, () => `Casa de ${owner()}`]];
      if (wealth >= 2 || big) opts.push([wealth >= 3 ? 4 : 1.5, () => `Residencia ${sur}`], [1, () => `Quinta ${r.pick(FEM_NOUN)}`], [0.8, () => `Villa ${r.pick(FEELINGS).replace(/^(La|El) /, '')}`]);
      if (fl >= 3 || (prewar && fl >= 2 && big)) opts.push([5, () => `Edificio ${r.pick([sur, ...THINGS.slice(0, 12), 'Central', 'Hidalgo', 'Morelos', 'Juárez'])}`], [2, () => `Departamentos ${r.pick(FEELINGS)}`]);
      if (spec.layout === 'vecindad' || spec.mf === 'vecindad') opts.push([8, () => `Vecindad ${r.pick([...SAINTS, ...FEELINGS])}`]);
      if (spec.layout === 'cuarteria' || spec.mf === 'cuarteria') opts.push([8, () => `Cuartería ${sur}`]);
      if (ctx.farm) opts.push([5, () => `Rancho ${r.pick([...THINGS, ...SAINTS, ...FEELINGS])}`], [2, () => `Rancho de los ${sur}`]);
      name = W(r, opts); break;
    }
    case 'shack': name = W(r, [[3, () => `Jacal de ${nick(r, fem)}`], [2, () => `Casita ${sur}`], [1, () => `Choza de ${r.pick(NICKS)}`], [1, () => `Tejabán ${sur}`]]); break;
    case 'shop': case 'store': name = W(r, [[4, () => `Abarrotes ${r.pick([sur, ...THINGS])}`], [3, () => `Miscelánea ${r.pick([...THINGS, ...FEELINGS, sur])}`], [2, () => `Tienda ${r.pick([...THINGS, ...FEELINGS])}`], [1.5, () => `Abarrotes ${owner()}`], [1, () => `Depósito ${r.pick(THINGS)}`], [0.8, () => `Compra y Venta ${sur}`], [0.6, () => `Tienda ${r.pick(WASTE)}`]]); break;
    case 'cantina': name = W(r, [[4, () => `Cantina ${r.pick([...THINGS, ...WASTE])}`], [2, () => `${r.pick(['El Último Trago', 'La Cueva', 'El Rincón', 'La Fonda Seca', 'El Abrevadero', 'La Polvareda', 'El Paraíso', 'Los Compas', 'El Desierto'])}`], [1.5, () => `Bar ${r.pick(THINGS)}`], [1, () => `Cantina de ${r.pick(NICKS)}`], [0.8, () => `Salón ${r.pick(['Bohemio', 'Rojo', 'Azul', 'Tropical'])}`]]); break;
    case 'cafe': name = W(r, [[4, () => `Fonda ${owner()}`], [2, () => `Lonchería ${r.pick(FEM_NOUN)}`], [2, () => `Cocina Económica ${r.pick([...FEELINGS, sur])}`], [1.5, () => `Comedor ${r.pick(THINGS)}`], [1, () => `Mariscos ${r.pick(THINGS)}`], [1, () => `Birria ${r.pick(NICKS)}`], [spec.layout === 'diner' ? 6 : 0.2, () => `Diner ${r.pick(['Highway', '1', 'Sunset', 'Desert'])}`]]); break;
    case 'workshop': name = W(r, [[3, () => `Taller ${sur}`], [2, () => `Herrería ${r.pick([sur, ...THINGS])}`], [1.5, () => `Soldaduras ${sur}`], [1.5, () => `Carpintería ${r.pick([sur, ...SAINTS])}`], [1, () => `Taller de ${r.pick(NICKS)}`], [1, () => `Reparaciones ${sur}`]]); break;
    case 'garage': name = W(r, [[3, () => `Taller Mecánico ${sur}`], [2, () => `Talachas ${r.pick(NICKS)}`], [1.5, () => `Llantera ${r.pick(THINGS)}`], [1.5, () => `Vulcanizadora ${sur}`], [1, () => `Autopartes ${r.pick(THINGS)}`], [0.8, () => `Taller de ${r.pick(NICKS)}`]]); break;
    case 'warehouse': case 'barn': case 'granary': name = W(r, [[3, () => `Bodega ${sur}`], [2, () => `Almacén ${r.pick([...THINGS, ...FEELINGS])}`], [1, () => `${kind === 'granary' ? 'Troje' : 'Galerón'} ${sur}`], [kind === 'barn' ? 3 : 0, () => `Establo ${sur}`]]); break;
    case 'posada': name = W(r, [[spec.layout === 'motel' ? 6 : 0.5, () => `Motel ${r.pick(['El Camino', 'Del Desierto', 'Sol y Arena', 'La Ruta', 'Las Palmas', 'Kilómetro ' + r.int(12, 190)])}`], [3, () => `Posada ${r.pick([...SAINTS, ...THINGS])}`], [2, () => `Casa de Huéspedes ${sur}`], [1.5, () => `Hotel ${r.pick(['Central', 'Del Valle', 'Plaza', 'Los Arcos'])}`], [1, () => `Mesón ${r.pick(THINGS)}`]]); break;
    case 'clinic': name = W(r, [[3, () => `Consultorio Dr${fem ? 'a' : ''}. ${sur}`], [2, () => `Clínica ${r.pick(SAINTS)}`], [1.5, () => `Dispensario ${r.pick(FEELINGS)}`], [1, () => `Enfermería ${sur}`], [spec.layout === 'curandero' ? 6 : 0.5, () => `Yerbería ${r.pick(SAINTS)}`]]); break;
    case 'chapel': case 'mission': if (spec.cult) { name = placeName('plot', { id: spec.id, nameV: spec.nameV, use: 'cult' }); break; } name = kind === 'mission' ? `Misión de ${r.pick(SAINTS)}` : W(r, [[4, () => `Capilla de ${r.pick(SAINTS)}`], [1.5, () => `Templo ${r.pick(SAINTS)}`], [1, () => `Iglesia de ${r.pick(SAINTS)}`]]); break;
    case 'hall': name = W(r, [[2, () => `Salón ${r.pick([...FEELINGS, ...THINGS])}`], [1.5, () => `Salón Ejidal`], [1, () => `Salón de Eventos ${sur}`], [1, () => `Casa del Pueblo`]]); break;
    case 'office': name = W(r, [[2, () => `Oficina de Registro`], [1.5, () => `Correos`], [1, () => `Despacho ${sur}`], [1, () => `Oficina de Aguas`], [1, () => `Comisariado Ejidal`]]); break;
    case 'townhall': { const k = r.pick(['Delegación Municipal', 'Presidencia Municipal', 'Palacio Municipal', 'Comisaría', 'Ayuntamiento']); name = ctx.town ? `${k} de ${ctx.town}` : k; break; }
    case 'comandancia': name = r.pick(['Comandancia', 'Comandancia de Policía', 'Seguridad Pública', 'Cárcel Municipal']); break;
    case 'den': {
      const L = spec.layout;
      name = L === 'cages' ? W(r, [[3, () => `Corral de ${r.pick(NICKS)}`], [2, () => `El Mercado de ${sur}`], [1, () => `Las Jaulas`]])
        : L === 'brothel' ? W(r, [[3, () => `Casa ${r.pick(['Roja', 'Rosa', 'de Citas', 'de la Luna'])}`], [2, () => `${r.pick(['La Mariposa', 'El Paraíso', 'Las Tres Rosas', 'La Gloria', 'El Edén'])}`], [1, () => `Casa de ${owner()}`]])
        : L === 'gambling' ? W(r, [[3, () => `Casino ${r.pick(['La Suerte', 'El As', 'Del Desierto', 'Royal', 'Los Dados'])}`], [2, () => `${r.pick(['La Baraja', 'El Siete', 'Garito', 'La Ruleta'])} ${r.pick(['', sur])}`.trim()], [1, () => `Cartas de ${r.pick(NICKS)}`]])
        : L === 'chopshop' ? W(r, [[3, () => `Doctor ${r.pick(['Cuchillo', 'Sierra', 'Gancho', 'Martillo', 'Puntadas'])}`], [2, () => `Consultorio ${sur}`], [1, () => `Cirugías ${r.pick(NICKS)}`]])
        : L === 'gunshop' ? W(r, [[3, () => `Armas ${sur}`], [2, () => `${r.pick(['El Arsenal', 'Plomo y Pólvora', 'Calibres', 'El Búnker'])}`], [1, () => `Parque de ${r.pick(NICKS)}`]])
        : L === 'bounty' ? W(r, [[3, () => `Oficina de Recompensas`], [2, () => `Cazarrecompensas ${sur}`], [1, () => `Se Busca`]])
        : L === 'water' ? W(r, [[3, () => `Agua ${r.pick(['Pura', 'Limpia', 'Bendita', sur])}`], [2, () => `Aguador ${sur}`], [1, () => `El Pozo de ${r.pick(NICKS)}`]])
        : L === 'rotunda' ? placeName('plot', { id: spec.id, nameV: spec.nameV, use: 'cult' })
        : L === 'gatehouse' ? W(r, [[3, () => `Garita ${r.pick(['Norte', 'Sur', 'del Camino', sur])}`], [2, () => `Peaje de ${r.pick(NICKS)}`]])
        : W(r, [[3, () => `${L === 'fuselage' ? 'El Avión' : 'El Camión'} de ${r.pick(NICKS)}`], [2, () => `Casa ${sur}`]]);
      break;
    }
    case 'bodega': name = W(r, [[3, () => `Vinícola ${r.pick([sur, ...SAINTS])}`], [2, () => `Bodega ${r.pick([sur, ...THINGS])}`], [1, () => `Vinos ${sur}`]]); break;
    case 'mill': name = `Molino ${r.pick([sur, ...SAINTS, ...THINGS])}`; break;
    case 'trade': name = W(r, [[1, () => `Tortillería ${r.pick([...FEM_NOUN, ...THINGS])}`], [1, () => `Panadería ${r.pick([...SAINTS, sur])}`], [1, () => `Carnicería ${sur}`], [1, () => `Alfarería ${sur}`], [1, () => `Herrería ${sur}`]]); break;
    case 'pemex': name = W(r, [[2, () => `Damex ${r.pick(['Km ' + r.int(10, 240), ...THINGS])}`], [2, () => `Gasolinera ${r.pick(['Km ' + r.int(10, 240), ...THINGS])}`], [1, () => `Estación de Servicio ${sur}`], [1, () => `Gasolinera ${r.pick(WASTE)}`]]); break;
    case 'stand': name = W(r, [[2, () => `Puesto de ${owner()}`], [1.5, () => `Tacos ${r.pick(NICKS)}`], [1, () => `Raspados ${r.pick(FEM_NOUN)}`], [1, () => `Elotes ${r.pick(NICKS)}`]]); break;
    case 'kiosk': name = `Kiosko ${r.pick(THINGS)}`; break;
    case 'guardpost': case 'barracks': case 'bunker': case 'armory': name = `${{ guardpost: 'Garita', barracks: 'Cuartel', bunker: 'Búnker', armory: 'Armería' }[kind]} ${r.pick(['Norte', 'Sur', 'Uno', 'Dos', 'del Puerto', 'del Camino', sur])}`; break;
    case 'factory': name = W(r, [[2, () => `Empacadora ${r.pick(THINGS)}`], [1.5, () => `Enlatadora ${r.pick(FEELINGS)}`], [1, () => `Fábrica de Hielo ${r.pick(THINGS)}`], [1, () => `Planta ${sur}`]]); break;
    case 'pumphouse': name = r.pick(['Casa de Bombas', 'Pozo Núm. ' + r.int(2, 30), 'Bombeo Ejidal']); break;
    case 'silos': name = `Silos ${r.pick(['Ejidales', sur, ...FEELINGS])}`; break;
    case 'shelter': name = r.pick(['Refugio', 'Albergue', 'Galerón', 'Refugio ' + r.pick(SAINTS)]); break;
    case 'utility': name = r.pick(['Subestación', 'Planta de Luz', 'Torre de Agua', 'Planta de Bombeo']); break;
    case 'outhouse': case 'shed': name = null; break;
    default: name = `${kind.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())} ${sur}`;
  }
  // the good side of town (wealthy zone): houses go by the family's full name or a title, villas by a name; cafés are refined
  if (spec.zcat === 'wealthy' && !spec.biz && !ruin) {
    const s2 = r.pick(SURNAMES.filter((x) => x !== sur)), title = r.pick(['Licenciado', 'Doctor', 'Ingeniero', 'Arquitecto', 'Coronel', 'Notario']);
    const VN = ['Margarita', 'Las Bugambilias', 'Los Laureles', 'Las Palmas', 'Del Mar', 'Esmeralda', 'Los Olivos', 'Santa Elena', 'Las Rosas', 'Del Sol', 'Mirador', 'Los Cedros', 'Alicia', 'Victoria'];
    const H = {
      house: [[3, () => `Residencia ${sur} ${s2}`], [2, () => `Casa ${sur}-${s2}`], [2, () => `Villa ${r.pick(VN)}`], [1.5, () => `Quinta ${r.pick(VN)}`], [1.2, () => `Casa del ${title} ${sur}`], [0.6, () => `Mansión ${sur}`], [0.8, () => `Los ${plural(sur)}`]],
      cafe: [[2, () => `Café ${r.pick(['de la Plaza', 'Imperial', 'Colonial', 'Real', 'Del Prado', 'Continental'])}`], [1.5, () => `Salón de Té ${r.pick(VN)}`], [1.2, () => `Cafetería ${sur}`], [1, () => 'Pastelería Fina']],
      shop: [[2, () => `Almacenes ${sur}`], [1.5, () => `La Elegante`], [1, () => `Casa ${sur} · Finos`]],
      garage: [[1, () => null]],
    }[kind];
    if (H) return { name: W(r, H), old: null };
  }
  // the good side of town: upscale trades and a proper restaurant (wealthy zones); never a gonzo name
  if (spec.biz) {
    const fn = () => r.pick(['Paloma', 'Lupita', 'Marisol', 'Yadira', 'Coco', 'Fabiola', 'Vicky', 'Rocío']);
    const B = {
      estetica: [[3, () => `Estética ${fn()}`], [2, () => 'Salón de Belleza Glamour'], [1.5, () => `Barbería ${sur}`], [1, () => 'Estilistas Unidos'], [1, () => `Peluquería ${fn()}`]],
      sastreria: [[3, () => `Sastrería ${sur}`], [1.5, () => 'Sastrería Fina'], [1, () => 'Casimires y Trajes'], [1, () => `Alta Costura ${sur}`]],
      joyeria: [[3, () => `Joyería ${sur}`], [1.5, () => 'Joyería Imperial'], [1.2, () => 'Relojería Fina'], [1, () => 'Oro y Plata']],
      boutique: [[2, () => `Boutique ${fn()}`], [1.5, () => 'Boutique Chic'], [1.2, () => 'Perfumería Elegance'], [1, () => `Novedades ${sur}`]],
      fotografo: [[2, () => `Fotografía ${sur}`], [1.5, () => 'Foto Estudio Arte'], [1, () => 'Retratos Finos']],
      notaria: [[3, () => `Notaría Pública No. ${r.int(2, 19)}`], [2, () => `Lic. ${sur} · Abogados`], [1, () => 'Bufete Jurídico']],
      restaurante: [[3, () => `Restaurante ${sur}`], [2, () => 'Casino Social'], [1.5, () => 'La Terraza'], [1.5, () => 'Restaurante Bar El Patio'], [1, () => 'Club Campestre'], [1, () => `Los Arcos de ${sur}`]],
    }[spec.biz];
    if (B) return { name: W(r, B), old: null };
  }
  // now and then the wasteland names it instead (more often for the trades that live on attitude)
  const gk = { cantina: 'cantina', cafe: 'cafe', shop: 'shop', store: 'shop', posada: 'posada', clinic: 'clinic', workshop: 'workshop', garage: 'garage', house: 'house', shack: 'house' }[kind];
  const gp = { cantina: 0.3, cafe: 0.22, shop: 0.18, posada: 0.25, clinic: 0.2, workshop: 0.18, garage: 0.18, house: 0.1 }[gk] ?? 0; // (halved below except for the Fallout mix: houses 5%)
  // half as often in general; full strength for buildings put up by the Fallout mix category
  if (name && gk && !spec.layout && new RNG(`gonzo:${spec.id}:${spec.nameV || 0}`).chance(gp * (spec.zcat === 'fallout' ? 1 : 0.5))) {
    const g = new RNG(`gonzo2:${spec.id}:${spec.nameV || 0}`);
    name = (g.chance(0.75) ? g.pick(GONZO[gk]) : `${{ cantina: 'Cantina', cafe: 'Fonda', shop: 'Abarrotes', posada: 'Posada', clinic: 'Clínica', workshop: 'Taller', garage: 'Taller', house: 'Casa' }[gk]} ${g.pick(GONZO.any)}`).replace('{S}', sur);
  }
  // out on the edge of town, half the households go by what everyone calls them (Fallout fashion)
  if (name && ctx.outskirts && ['house', 'shack'].includes(kind) && new RNG(`edge:${spec.id}:${spec.nameV || 0}`).chance(0.5)) {
    const g = new RNG(`edge2:${spec.id}:${spec.nameV || 0}`), N = g.pick(EDGE_NICKS);
    name = W(g, [[3, () => `Lo de ${N}`], [2, () => `${kind === 'shack' ? 'El Jacal' : 'La Casa'} de ${N}`], [1.5, () => `Rancho de ${N}`], [1.5, () => N], [1, () => `Donde ${N}`]]);
  }
  if (name && ruin) name = W(r, [[2, () => `Ruinas de ${name.replace(/^Casa /, 'la Casa ')}`], [1, () => `Antigua ${name}`.replace('Antigua El ', 'Antiguo ')], [1.5, () => `${name} (abandonada)`]]);
  // a pre-war shell now used for something else: the old name still shows, faded, over the door
  const old = !ruin && (spec.origin === 'repurposed' || (ctx.prewarUse && r.chance(0.7)) || (prewar && kind !== 'house' && r.chance(0.35))) ? prewarName(new RNG(`old:${spec.id}`), r.pick(SURNAMES)) : null;
  return { name, old };
}

// a family name per plot (households share one)
export function surnameFor(key) { return new RNG(`family:${key}`).pick(SURNAMES); }

// the sign over a business: its name in capitals, the trade on top, the rest below
export function signFromName(name) {
  if (!name) return null;
  const s = name.toUpperCase(), sp = s.indexOf(' ');
  if (s.length <= 14 || sp < 0) return s;
  return s.slice(0, sp) + '\n' + s.slice(sp + 1);
}

// ---------------------------------------------------------------- places: zones, fields, roads
const STREETS = ['Hidalgo', 'Morelos', 'Juárez', 'Zaragoza', 'Allende', 'Madero', 'Guerrero', 'Independencia', 'Reforma', 'Revolución', '5 de Mayo', '16 de Septiembre', 'Constitución', 'Obregón', 'Libertad', 'Progreso', 'Las Flores', 'Del Mar', 'Del Sol', 'Los Pinos', 'La Palma', 'Primavera'];
const DARK = ['La Cadena', 'Los Grilletes', 'El Hierro', 'La Marca', 'El Látigo', 'La Soga', 'El Candado'];
// a name for a zone / plot use, a field or a road (null when it has none: a plain building plot takes its building's)
export function placeName(type, e) { const n = placeName0(type, e); return n && n.replace(/ a El /g, ' al ').replace(/ de El /g, ' del ').replace(/ (Del|De|La|Las|Los) (Mar|Sol|Flores|Pinos|Palma)$/, (m, a, b) => ` ${a.toLowerCase()} ${b}`); }
function placeName0(type, e) {
  const r = new RNG(`place:${e.id}:${e.nameV || 0}`), sur = r.pick(SURNAMES), nk = () => r.pick(NICKS), fem = r.chance(0.5);
  const owner = () => (fem ? `Doña ${nick(r, true)}` : `Don ${nick(r, false)}`);
  if (type === 'road') {
    const t = e.type || 'gravel';
    if (t === 'highway') return W(r, [[3, () => 'Carretera Transpeninsular'], [2, () => `Carretera Km ${r.int(12, 240)}`], [1, () => 'La Federal']]);
    if (t === 'paved') return W(r, [[4, () => `Calle ${r.pick(STREETS)}`], [2, () => `Avenida ${r.pick(STREETS)}`], [1, () => `Boulevard ${r.pick(STREETS)}`]]);
    if (t === 'gravel') return W(r, [[4, () => `Calle ${r.pick([...STREETS, ...SAINTS])}`], [1.5, () => `Calle ${r.pick(THINGS).replace(/^(El|La) /, '')}`], [1, () => `Privada ${sur}`]]);
    if (t === 'dirt') return W(r, [[3, () => `Callejón ${r.pick([...THINGS, ...SAINTS]).replace(/^(El|La) /, '')}`], [2, () => `Camino a ${r.pick(THINGS)}`], [1, () => `Calle ${r.pick(STREETS)}`]]);
    if (t === 'track') return W(r, [[3, () => `Brecha ${r.pick(THINGS)}`], [2, () => `Camino Viejo`], [1, () => `Camino a ${r.pick(THINGS)}`]]);
    return W(r, [[3, () => `Vereda ${r.pick(THINGS)}`], [1, () => `Sendero de ${nk()}`]]);
  }
  if (type === 'field') {
    const t = e.type;
    if (t === 'garden' || e.inPlot) return null;
    if (t === 'orchard') return W(r, [[3, () => `Huerta ${sur}`], [2, () => `Huerta ${r.pick(THINGS)}`], [1, () => `Los Frutales de ${owner()}`]]);
    if (t === 'vineyard') return W(r, [[3, () => `Viñedo ${r.pick([sur, ...SAINTS])}`], [1, () => `Parras de ${owner()}`]]);
    if (t === 'corral') return W(r, [[3, () => `Corral de ${nk()}`], [2, () => `Corral ${sur}`]]);
    if (e.fallow || t === 'fallow') return W(r, [[3, () => `Barbecho ${sur}`], [2, () => `Parcela ${r.int(1, 60)}`], [1, () => `Tierra de ${owner()}`]]);
    return W(r, [[4, () => `Milpa de los ${sur}`], [2, () => `Parcela ${r.int(1, 60)}`], [1.5, () => `Ejido ${r.pick(THINGS)}`], [1, () => `La Labor de ${owner()}`]]);
  }
  switch (e.use) {
    case 'plaza': return W(r, [[3, () => r.pick(['Plaza Principal', 'Plaza de Armas', 'Plaza Hidalgo', 'Plaza de la Constitución', 'Plaza Juárez'])], [2, () => `Plaza ${r.pick(SAINTS)}`], [1, () => `Jardín ${r.pick(THINGS)}`]]);
    case 'cemetery': return W(r, [[3, () => `Panteón ${r.pick(['Municipal', 'Viejo', 'de los Ángeles', 'del Carmen'])}`], [2, () => `Panteón ${r.pick(SAINTS)}`], [1, () => `Camposanto ${r.pick(THINGS)}`]]);
    case 'market': return W(r, [[3, () => `Mercado ${r.pick(['Municipal', 'Central', 'Hidalgo', 'del Pueblo'])}`], [2, () => `Mercado ${r.pick(SAINTS)}`], [1, () => `Mercado ${r.pick(THINGS)}`]]);
    case 'farmers_market': return W(r, [[3, () => `Tianguis ${r.pick(['del Domingo', 'del Valle', 'de los Martes', 'del Pueblo'])}`], [2, () => `Tianguis ${r.pick(SAINTS)}`]]);
    case 'trader': return W(r, [[3, () => `Casa Comercial ${sur}`], [2, () => `${sur} e Hijos`], [1.5, () => `Almacenes ${sur}`], [1, () => `Casa ${sur} y Hnos.`]]);
    case 'visitors': return W(r, [[3, () => `Paradero ${r.pick(THINGS)}`], [2, () => 'Llano de los Arrieros'], [1, () => `Campamento ${r.pick(THINGS)}`]]);
    case 'wayhouse': return W(r, [[3, () => `Casa de Paso ${r.pick([...THINGS, ...SAINTS])}`], [1, () => 'Casa de Paso de la Hermandad']]);
    case 'lienzo': return W(r, [[3, () => `Lienzo Charro ${r.pick([...THINGS, sur])}`], [1, () => `Lienzo ${r.pick(SAINTS)}`]]);
    case 'mystic': return W(r, [[2, () => `Casa de ${owner()}`], [2, () => `Yerbería ${r.pick(SAINTS)}`], [1.5, () => 'La Casa de la Bruja'], [1, () => `El Vidente ${nk()}`], [1, () => `Consultorio Espiritual ${r.pick(SAINTS)}`]]);
    case 'brickyard': return W(r, [[3, () => `Adobera ${sur}`], [2, () => `Ladrillera ${r.pick(THINGS)}`]]);
    case 'salvage': return W(r, [[3, () => `Yonke ${r.pick([sur, ...THINGS])}`], [2, () => `Deshuesadero de ${nk()}`], [1, () => `Autopartes Usadas ${sur}`]]);
    case 'acopio': return W(r, [[3, () => `Centro de Acopio ${r.pick(THINGS)}`], [2, () => `Chatarrera ${sur}`], [1, () => `Compra de Fierro ${sur}`]]);
    case 'outskirts': return W(r, [[3, () => `Ranchito de los ${sur}`], [2, () => `Rancho ${r.pick(THINGS)}`]]);
    case 'outgrounds': return W(r, [[3, () => `Llano ${r.pick(THINGS)}`], [2, () => `Potrero ${sur}`]]);
    case 'farmstead': return W(r, [[3, () => `Rancho ${r.pick([...THINGS, ...SAINTS])}`], [2, () => `Rancho de los ${sur}`], [1, () => `Hacienda ${r.pick(FEELINGS)}`]]);
    case 'vineyard': return W(r, [[3, () => `Viñedo ${r.pick([sur, ...SAINTS])}`], [1, () => `Parras de ${owner()}`]]);
    case 'era': return W(r, [[3, () => `Era de los ${sur}`], [1, () => `La Era ${r.pick(THINGS)}`]]);
    case 'field': case 'fallow': case 'orchard': case 'corral': return placeName0('field', { ...e, type: e.use === 'fallow' ? 'field' : e.use, fallow: e.use === 'fallow', inPlot: null });
    case 'multifamily': { const k = e.mfKind; return k === 'vecindad' ? `Vecindad ${r.pick([...SAINTS, ...FEELINGS])}` : k === 'cuarteria' ? `Cuartería ${sur}` : k === 'block' ? `Edificio ${r.pick(['Central', 'Hidalgo', 'Morelos', sur, ...THINGS.slice(0, 10)])}` : k === 'locales' ? W(r, [[2, () => `Locales ${sur}`], [1, () => `Plaza Comercial ${r.pick(THINGS)}`]]) : `Los ${sur}`; }
    // the wasteland
    case 'slavers': return W(r, [[3, () => `${r.pick(['Campo', 'Rancho', 'Corral'])} ${r.pick(DARK)}`], [2, () => `El Mercado de ${nk()}`], [2, () => r.pick(['La Subasta', 'El Corral de Carne', 'El Tianguis Negro', 'Los Encadenados', 'La Mercancía'])], [1, () => `Campamento de ${nk()}`], [1, () => `Los Cazadores de ${sur}`]]);
    case 'caravan': return W(r, [[3, () => `Paradero de Caravanas ${r.pick(THINGS)}`], [2, () => `Caravanas ${sur} e Hijos`], [1.5, () => `Patio de Carga ${sur}`], [1, () => r.pick(['La Recua', 'El Último Abrevadero', 'Las Carretas'])]]);
    case 'chemden': return W(r, [[3, () => `La Cocina de ${nk()}`], [2, () => r.pick(['El Laboratorio', 'El Alambique', 'La Química', 'Destilería Clandestina', 'La Fábrica de Sueños'])], [1, () => `Destilería ${r.pick(WASTE)}`]]);
    case 'fightpit': return W(r, [[2, () => r.pick(['El Foso', 'El Pozo de Sangre', 'El Coliseo', 'La Arena'])], [1, () => `La Fosa de ${nk()}`], [1, () => `Arena ${r.pick(THINGS)}`],
      [5, () => r.pick(['El Foso de los Lamentos', 'La Licuadora', 'Arena Mata-Mata', 'El Coliseo del Puño', 'La Tómbola de Huesos', 'Pelea o Paga', 'El Ring de la Rata', 'La Carnicería de los Sábados', 'El Hoyo del Diablo', 'Los Puños Radiactivos', 'Sangre y Cerveza', 'El Gallinero Humano', 'La Moledora', 'Arena Tétanos', 'El Ruedo de Chatarra', 'Lucha Libre Atómica', 'La Fosa de los Mutantes', 'El Pollo Muerto', 'El Patio de los Dientes', 'Dientes Flojos', 'La Última Mordida', 'El Gran Madrazo', 'Arena Sin Reglas', 'El Matadero Feliz', 'Coliseo Cucaracha', 'La Jaula de los Locos', 'El Domingo Sangriento', 'Rompehuesos', 'Puño de Hierro', 'El Velorio Alegre'])],
      [2, () => `${r.pick(['Golpes y Apuestas', 'Madrazos', 'Box Clandestino', 'Lucha en Lodo', 'Peleas de Perros y Hombres'])} de ${nk()}`]]);
    case 'scavmarket': return W(r, [[3, () => r.pick(['Tianguis del Fierro', 'El Cambalache', 'La Pulga', 'El Trueque', 'Mercado de Chatarra'])], [2, () => `Bazar ${r.pick(WASTE)}`], [1, () => `Compra y Venta de ${nk()}`]]);
    case 'cult': return W(r, [[2, () => `Los Hijos ${r.pick(['del Átomo', 'del Sol Negro', 'del Último Día', 'del Resplandor', 'de la Ceniza', 'de la Bomba', 'del Hongo Sagrado', 'de la Lluvia Verde'])}`], [1, () => `El Profeta ${nk()}`],
      [5, () => r.pick(['Templo del Ojo', 'Iglesia del Fin', 'La Luz Única', 'Hermandad del Resplandor', 'La Congregación', 'Iglesia de la Santa Radiación', 'Los Testigos del Destello', 'Templo del Sol que Cayó', 'La Orden del Tercer Ojo', 'Santuario de la Bendita Mutación', 'Los Ungidos del Polvo', 'Iglesia del Gran Chispazo', 'Las Hermanas del Silencio Verde', 'El Culto del Cactus Parlante', 'La Sagrada Familia Fosforescente', 'Templo del Dios Lagarto', 'Los Peregrinos del Cráter', 'Iglesia Bautista de la Lluvia Ácida', 'La Secta del Coyote Eterno', 'Los Elegidos del Búnker', 'Templo de San Geiger', 'La Iglesia del Último Refresco', 'Hermandad de la Llama Azul', 'Los Devotos de la Antena', 'El Rebaño de la Estrella Caída'])],
      [1.5, () => `${r.pick(['Iglesia', 'Templo', 'Santuario', 'Capilla'])} de ${r.pick(['San Geiger', 'Santa Ceniza', 'la Virgen Radiante', 'Nuestra Señora del Hongo', 'el Santo Mutante', 'San Vatio'])}`]]);
    default: return null;
  }
}

// ---------------------------------------------------------------- town names (new map dialog, the town hall's name)
const T_SAINT = ['San Isidro', 'San Telmo', 'San Juanico', 'San Ramón', 'San Vicente', 'San Matías', 'San Agustín', 'San Jacinto', 'San Gregorio', 'San Simón', 'Santa Catarina', 'Santa Gertrudis', 'Santa Inés', 'Santa Marta', 'Santa Lucía', 'Santo Tomás', 'San Benito', 'San Fermín', 'San Lázaro', 'Santa Eulalia'];
const T_PLACE = ['Arroyo', 'Cerro', 'Ojo de Agua', 'Llano', 'Valle', 'Cañada', 'Mesa', 'Loma', 'Laguna', 'Paso', 'Puerto', 'Punta', 'Vado', 'Bajío', 'Rincón'];
const T_THING = ['Mezquite', 'Huizache', 'Coyote', 'Zopilote', 'Venado', 'Palmar', 'Nopal', 'Salitre', 'Cardón', 'Pitahaya', 'Alacrán', 'Tecolote', 'Carrizo', 'Álamo', 'Gavilán', 'Tule', 'Jabalí', 'Borrego'];
const T_ADJ_M = ['Seco', 'Quemado', 'Viejo', 'Verde', 'Colorado', 'Blanco', 'Perdido', 'Bonito', 'Hondo', 'Solo', 'Prieto', 'Negro'];
const T_ADJ_F = ['Seca', 'Quemada', 'Vieja', 'Verde', 'Colorada', 'Blanca', 'Perdida', 'Bonita', 'Honda', 'Sola', 'Prieta', 'Negra'];
const T_FEM = new Set(['Cañada', 'Mesa', 'Loma', 'Laguna', 'Punta']);
// new post-war towns: quiet hopeful names, and the gonzo ones
const T_NEW = ['La Esperanza', 'Buena Vista', 'Agua Dulce', 'El Descanso', 'Los Pozos', 'La Providencia', 'El Porvenir', 'La Concordia', 'Tierra Nueva', 'El Amanecer', 'La Paz Nueva', 'Los Huertos', 'El Manantial', 'La Bendición', 'Buen Camino', 'El Consuelo', 'Las Norias', 'La Unión', 'Paso Seguro', 'El Retoño'];
const T_GONZO = ['Ciudad Ceniza', 'Puerto Hongo', 'Villa Tres Ojos', 'Rancho Radiante', 'San Geiger', 'Nueva Cucaracha', 'El Cráter Feliz', 'Ojo Brillante', 'Lata Vieja', 'Los Mutantes', 'Polvo Rojo', 'Fin del Camino', 'Última Parada', 'Brillo Verde', 'Villa Chatarra', 'El Hongo Grande', 'Puerto Papi Cola', 'Agua Tibia Atómica', 'Los Dos Soles', 'Rata Gorda', 'Pueblo Sin Lluvia', 'Ciudad Tétanos', 'La Bomba Dormida', 'Coyote Quemado', 'Santo Búnker', 'El Gran Silencio', 'Dientes Negros', 'Llanta Rota', 'Calavera Contenta', 'Sol Doble'];
export function townName(seed) {
  const r = new RNG(`town:${seed}`), th = () => r.pick(T_THING);
  const place = () => { const p = r.pick(T_PLACE), f = T_FEM.has(p); return r.chance(0.5) ? `${p} ${f ? r.pick(T_ADJ_F) : r.pick(T_ADJ_M)}` : `${p} del ${th()}`; };
  const regular = () => W(r, [[3, () => `${r.pick(T_SAINT)}${r.chance(0.5) ? ` del ${th()}` : ''}`], [3, place], [2, () => `El ${th()}${r.chance(0.4) ? ' ' + r.pick(T_ADJ_M) : ''}`], [1.2, () => `${r.pick(['Ejido', 'Colonia', 'Villa', 'Rancho', 'Poblado'])} ${r.pick([...T_SAINT, ...T_THING.map((t) => `El ${t}`)])}`]]);
  const k = r.next();
  let n;
  if (k < 0.4) n = regular();
  else if (k < 0.65) { // the pre-war name, rebuilt or renamed
    const b = regular();
    n = W(r, [[2, () => `Neo ${b.replace(/^(El|La|Los|Las) /, '')}`], [2, () => (/^(La|Las|Santa|Laguna|Mesa|Loma|Cañada|Punta|Villa|Colonia)\b/.test(b) ? `Nueva ${b}` : `Nuevo ${b}`).replace(/ (El|La) /, ' ')], [1.5, () => `${b} Libre`], [1.2, () => `${b} Renacido`.replace(/^(La|Santa|Villa|Colonia|Laguna|Mesa|Loma|Cañada|Punta)(.*)Renacido$/, '$1$2Renacida')], [1, () => `${b} de Abajo`], [1, () => `Ex-${b}`], [1, () => `${b} II`], [1, () => `Post ${b}`], [0.8, () => `${b} Reconstruido`.replace(/^(La|Santa|Villa|Colonia|Laguna|Mesa|Loma|Cañada|Punta)(.*)Reconstruido$/, '$1$2Reconstruida')]]);
  } else n = r.chance(0.5) ? r.pick(T_NEW) : r.pick(T_GONZO);
  return n.replace(/ de El /g, ' del ');
}
