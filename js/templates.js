// =====================================================================
//  PLANTILLAS: Survey e Installation Report
//  - "label" es lo que ve el técnico (español).
//  - "v" es el valor en INGLÉS que aparece en el PDF / correo / WhatsApp.
//  - Para añadir una opción a una lista basta con añadir una línea { v, es }.
// =====================================================================

const o = (v, es) => ({ v, es });


// ---------------------------------------------------------------------
// LISTAS DE OPCIONES
// ---------------------------------------------------------------------
export const OPT = {
  clients: [o('Veolia', 'Veolia')],
  surveyObjective: [
    o('Validate the feasibility of the Starlink antenna installation', 'Validar viabilidad de instalación Starlink'),
    o('Determine the antenna location', 'Determinar ubicación de la antena'),
    o('Study the cable route to the network infrastructure', 'Estudiar el recorrido del cable'),
    o('Identify the required equipment and access means', 'Identificar material y medios de acceso'),
    o('Identify the safety requirements for the intervention', 'Identificar requisitos de seguridad'),
    o('Assess the existing installation', 'Evaluar la instalación existente'),
  ],
  location: [
    o('Roof', 'Tejado / cubierta'), o('Façade', 'Fachada'), o('Wall', 'Pared'), o('Mast / pole', 'Mástil / poste'),
    o('Ground', 'Suelo'), o('Balcony / terrace', 'Balcón / terraza'), o('Vehicle', 'Vehículo'),
  ],
  surface: [
    o('Flat roof with waterproof membrane', 'Cubierta plana con membrana'),
    o('Metal deck roof', 'Cubierta de chapa'), o('Tiled roof', 'Tejado de tejas'),
    o('Concrete roof', 'Cubierta de hormigón'), o('Wooden roof façade', 'Fachada/tejado de madera'),
    o('Concrete wall', 'Pared de hormigón'), o('Brick wall', 'Pared de ladrillo'),
    o('Metal cladding', 'Revestimiento metálico'), o('Existing mast / pole', 'Mástil existente'),
    o('Ground / concrete slab', 'Suelo / losa'),
  ],
  skyView: [
    o('Excellent - clear view of the sky, no interruptions expected', 'Excelente (app Starlink)'),
    o('Good - minor obstructions', 'Buena - obstrucciones leves'),
    o('Fair - some obstructions, occasional interruptions possible', 'Regular - algunas obstrucciones'),
    o('Poor - significant obstructions', 'Mala - obstrucciones importantes'),
    o('Not checked', 'No comprobado'),
  ],
  rejectReasons: [
    o('Excessive cable length', 'Longitud de cable excesiva'),
    o('Intermediate active equipment / switches would be required', 'Requiere switches intermedios'),
    o('Proximity to high-power / high-voltage cables', 'Cerca de cables de potencia / alta tensión'),
    o('Multiple potential points of failure', 'Muchos puntos de fallo'),
    o('More complex installation and maintenance', 'Instalación y mantenimiento complejos'),
    o('Risk of electromagnetic interference', 'Riesgo de interferencias electromagnéticas'),
    o('No guarantee of link stability and performance', 'Sin garantía de estabilidad'),
  ],
  protection: [
    o('IRO tube', 'Tubo IRO'), o('Flexible conduit', 'Tubo corrugado'), o('Cable tray', 'Bandeja'),
    o('Existing trunking', 'Canaleta existente'), o('Metal conduit', 'Tubo metálico'),
    o('No protection required', 'Sin protección'),
  ],
  access: [
    o('MEWP / aerial work platform', 'Nacelle / plataforma elevadora'), o('Ladder', 'Escalera'),
    o('Scaffolding', 'Andamio'), o('Roof hatch / fixed access', 'Trampilla / acceso fijo'),
    o('Rope access', 'Trabajo con cuerdas'), o('No special access required', 'Sin medios especiales'),
  ],
  ppe: [
    o('Safety helmet', 'Casco'), o('Safety shoes', 'Calzado de seguridad'), o('High-visibility vest', 'Chaleco alta visibilidad'),
    o('Gloves', 'Guantes'), o('Long-sleeved clothing', 'Manga larga'), o('Safety glasses', 'Gafas'),
    o('Fall-arrest harness', 'Arnés anticaídas'), o('Hearing protection', 'Protección auditiva'),
  ],
  safetyReq: [
    o('Site safety rules must be strictly followed', 'Cumplir normas de seguridad del sitio'),
    o('PPE is mandatory', 'EPI obligatorio'),
    o('Site induction required', 'Formación/acogida en sitio'),
    o('Work permit required', 'Permiso de trabajo'),
    o('Fall protection required for work at height', 'Protección anticaídas en altura'),
    o('Area below the works must be cordoned off', 'Balizar zona bajo los trabajos'),
    o('Escort required on site', 'Acompañamiento obligatorio'),
    o('Hot work permit required', 'Permiso de trabajos en caliente'),
  ],
  destination: [
    o('Network rack', 'Rack de red'), o('SD-WAN infrastructure', 'Infraestructura SD-WAN'),
    o('Communications room', 'Sala de comunicaciones'), o('Network cabinet', 'Armario de red'),
    o('Office', 'Oficina'),
  ],
  materials: [
    o('Starlink proprietary RJ45/RJ45 cable', 'Cable Starlink RJ45/RJ45'), o('IRO tube and accessories', 'Tubo IRO y accesorios'),
    o('Cable ties and fixing accessories', 'Bridas y fijaciones'), o('Non-penetrating ballast mount', 'Soporte no penetrante con lastre'),
    o('MEWP rental', 'Alquiler de nacelle'), o('Consumables for routing, fixing and finishing', 'Consumibles'),
    o('Cable gland / wall entry kit', 'Pasamuros'), o('UPS / power outlet', 'SAI / toma eléctrica'),
  ],
  feasibility: [
    o('Feasible', 'Viable'), o('Feasible with conditions', 'Viable con condiciones'),
    o('Not feasible', 'No viable'), o('Pending further information', 'Pendiente de información'),
  ],
  starlinkMode: [o('Bypass mode', 'Modo bypass'), o('Router mode', 'Modo router')],
  ipType: [
    o('DHCP', 'DHCP'), o('Static IP', 'IP estática'), o('Public IP', 'IP pública (Starlink)'),
    o('CGNAT (Starlink default)', 'CGNAT (por defecto)'),
  ],
  wanPort: [o('WAN 1', 'WAN 1'), o('WAN 2', 'WAN 2'), o('WAN 3', 'WAN 3'), o('LAN as WAN', 'LAN como WAN')],
  priority: [o('Priority 1', 'Prioridad 1'), o('Priority 2', 'Prioridad 2'), o('Priority 3', 'Prioridad 3')],
  cellular: [o('5G', '5G'), o('4G LTE', '4G LTE'), o('Not used', 'No se usa')],
  entry: [
    o('Dedicated wall entry point', 'Pasamuros dedicado'), o('Existing duct', 'Conducto existente'),
    o('Roof entry gland', 'Paso por cubierta'), o('Window / door frame', 'Marco de ventana/puerta'),
  ],
  connections: [
    o('Starlink antenna cable → Starlink Router ("Dishy" port)', 'Antena → Router Starlink (puerto Dishy)'),
    o('Starlink Router Ethernet Adapter → WAN 1 on the Peplink router', 'Adaptador Ethernet Starlink → WAN 1 Peplink'),
    o('Starlink cable → Peplink WAN (bypass)', 'Cable Starlink → WAN Peplink'),
    o('Peplink LAN → Client\'s main switch / network patch panel', 'LAN Peplink → switch / patch panel cliente'),
    o('Peplink LAN → Client SD-WAN equipment', 'LAN Peplink → SD-WAN cliente'),
  ],
  power: [
    o('UPS in the rack', 'SAI en el rack'), o('Rack PDU', 'PDU del rack'), o('Wall outlet', 'Enchufe de pared'),
    o('PoE', 'PoE'), o('DC power supply', 'Alimentación DC'),
  ],
  starlinkStatus: [
    o('Online', 'Online'), o('Online after initialization period', 'Online tras inicialización'),
    o('Offline', 'Offline'), o('Degraded', 'Degradado'),
  ],
  obstructions: [
    o('None detected via the Starlink app', 'Ninguna (app Starlink)'),
    o('Minor obstructions detected', 'Obstrucciones leves'), o('Significant obstructions detected', 'Obstrucciones importantes'),
    o('Not checked', 'No comprobado'),
  ],
  peplinkTests: [
    o('Automatic failover to cellular confirmed when Starlink was disconnected', 'Failover a celular OK'),
    o('Automatic recovery to Starlink confirmed after reconnection', 'Vuelta a Starlink OK'),
    o('Internet access confirmed', 'Acceso a internet OK'),
    o('Device registered in InControl', 'Registrado en InControl'),
    o('Firmware updated to the latest version', 'Firmware actualizado'),
  ],
  finalStatus: [
    o('Completed', 'Completado'), o('Partially completed', 'Parcialmente completado'), o('Pending', 'Pendiente'),
  ],
};

// ---------------------------------------------------------------------
// PASOS COMUNES
// ---------------------------------------------------------------------
const serviceStep = (isSurvey) => ({
  id: 'service',
  title: 'Servicio',
  fields: [
    { key: 'client', type: 'select', label: 'Cliente', options: OPT.clients, allowOther: true, required: true, half: true },
    { key: 'contract', type: 'text', label: 'Contrato', placeholder: 'EST12345', half: true },
    { key: 'site_code', type: 'text', label: 'Código del sitio', placeholder: 'FR01473_00', required: true, half: true },
    { key: 'site_name', type: 'text', label: 'Nombre del sitio', placeholder: 'Arianeo', required: true, half: true },
    { key: 'date', type: 'date', label: 'Fecha', required: true, half: true, defaultValue: 'today' },
    { key: 'gps', type: 'gps', label: 'Ubicación GPS', half: true, help: 'Pulsa el botón para usar la posición del móvil' },
    { key: 'start_time', type: 'time', label: 'Hora inicio', half: true },
    { key: 'end_time', type: 'time', label: 'Hora fin', half: true },
    { key: 'technicians', type: 'people', label: 'Técnicos', required: true, allowOther: true },
    { key: 'supervisor', type: 'people', label: 'Supervisor / responsable' },
    { key: 'client_contact', type: 'text', label: 'Contacto del cliente en sitio', half: true },
    { key: 'recipient_email', type: 'email', label: 'Email destinatario del informe', half: true },
    ...(isSurvey
      ? [
          { key: 'objective', type: 'chips', label: 'Objeto de la visita', options: OPT.surveyObjective, allowOther: true, translatable: true },
          { key: 'objective_notes', type: 'textarea', label: 'Detalles del objeto (opcional)', translatable: true },
        ]
      : []),
  ],
});

const englishStep = { id: 'english', title: 'Revisar inglés', fields: [] };
const outputStep = { id: 'outputs', title: 'PDF / Email / WhatsApp', fields: [] };

// ---------------------------------------------------------------------
// SURVEY
// ---------------------------------------------------------------------
export const SURVEY = {
  type: 'survey',
  version: 1,
  title: 'Survey Report',
  steps: [
    serviceStep(true),
    {
      id: 'antenna',
      title: 'Antena',
      fields: [
        { key: 'antenna', type: 'antennaMount', label: 'Antena Starlink propuesta y montura' },
        { key: 'location', type: 'chips', label: 'Emplazamiento', options: OPT.location, allowOther: true },
        { key: 'surface', type: 'select', label: 'Tipo de superficie', options: OPT.surface, allowOther: true },
        { key: 'no_drilling', type: 'toggle', label: 'Sin perforación (preservar estanqueidad)' },
        { key: 'sky_view', type: 'select', label: 'Vista del cielo (app Starlink)', options: OPT.skyView },
        { key: 'antenna_notes', type: 'textarea', label: 'Notas del emplazamiento', translatable: true },
      ],
    },
    {
      id: 'route',
      title: 'Cableado',
      fields: [
        { key: 'initial_route', type: 'toggle', label: '¿El cliente propuso un recorrido inicial?' },
        { key: 'initial_length', type: 'number', label: 'Longitud recorrido inicial', unit: 'm', half: true, showIf: (d) => !!d.initial_route },
        { key: 'initial_retained', type: 'select', label: '¿Se retiene?', half: true, options: [o('Retained', 'Sí'), o('Not retained', 'No')], showIf: (d) => !!d.initial_route },
        { key: 'initial_reasons', type: 'chips', label: 'Motivos', options: OPT.rejectReasons, allowOther: true, translatable: true, showIf: (d) => d.initial_retained === 'Not retained' },
        { key: 'route_segments', type: 'segments', label: 'Recorrido recomendado (tramos)', help: 'Ej.: "tejado" 20 m, "bajada" 15 m…' },
        { key: 'route_cable', type: 'catalogSelect', catalogKind: 'cable', label: 'Cable recomendado', allowOther: true },
        { key: 'route_protection', type: 'chips', label: 'Protección del cable', options: OPT.protection, allowOther: true },
        { key: 'switch_needed', type: 'toggle', label: '¿Necesita switch intermedio?' },
        { key: 'route_notes', type: 'textarea', label: 'Notas del recorrido', translatable: true },
      ],
    },
    {
      id: 'access',
      title: 'Acceso y seguridad',
      fields: [
        { key: 'access', type: 'chips', label: 'Medios de acceso', options: OPT.access, allowOther: true },
        { key: 'mewp_height', type: 'number', label: 'Altura máxima de nacelle', unit: 'm', half: true, showIf: (d) => (d.access?.values ?? []).includes('MEWP / aerial work platform') },
        { key: 'access_notes', type: 'textarea', label: 'Restricciones de acceso', translatable: true },
        { key: 'ppe', type: 'chips', label: 'EPI obligatorios', options: OPT.ppe, allowOther: true },
        { key: 'safety', type: 'chips', label: 'Requisitos de seguridad', options: OPT.safetyReq, allowOther: true },
        { key: 'safety_notes', type: 'textarea', label: 'Notas de seguridad', translatable: true },
      ],
    },
    {
      id: 'infra',
      title: 'Infraestructura y material',
      fields: [
        { key: 'destination', type: 'chips', label: 'Llegada del cable', options: OPT.destination, allowOther: true },
        { key: 'destination_notes', type: 'textarea', label: 'Notas de la llegada / integración', translatable: true },
        { key: 'onsite_equipment', type: 'equipment', label: 'Material ya disponible en sitio' },
        { key: 'onsite_notes', type: 'textarea', label: 'Notas del material en sitio', translatable: true, placeholder: 'Ej.: material depositado en el sitio, a asegurar hasta la intervención' },
        { key: 'materials', type: 'chips', label: 'Material a aprovisionar', options: OPT.materials, allowOther: true },
        { key: 'materials_notes', type: 'textarea', label: 'Notas del material a aprovisionar', translatable: true },
      ],
    },
    {
      id: 'conclusion',
      title: 'Conclusión',
      fields: [
        { key: 'feasibility', type: 'select', label: 'Resultado', options: OPT.feasibility, required: true },
        { key: 'conditions', type: 'textarea', label: 'Condiciones / reservas', translatable: true, showIf: (d) => d.feasibility === 'Feasible with conditions' },
        { key: 'conclusion', type: 'textarea', label: 'Conclusión', translatable: true },
        { key: 'next_steps', type: 'textarea', label: 'Próximos pasos', translatable: true },
      ],
    },
    {
      id: 'photos',
      title: 'Fotos',
      fields: [
        { key: 'ph_ext', type: 'photos', label: 'Fotos exteriores', photoCategory: 'EXTERIOR' },
        { key: 'ph_int', type: 'photos', label: 'Fotos interiores', photoCategory: 'INTERIOR' },
        { key: 'ph_sky', type: 'photos', label: 'Captura app Starlink (obstrucciones)', photoCategory: 'SKY VIEW' },
      ],
    },
    englishStep,
    outputStep,
  ],
};

// ---------------------------------------------------------------------
// INSTALLATION REPORT
// ---------------------------------------------------------------------
export const INSTALLATION = {
  type: 'installation',
  version: 1,
  title: 'Installation Report',
  steps: [
    serviceStep(false),
    {
      id: 'equipment',
      title: 'Equipos',
      fields: [
        { key: 'equipment', type: 'equipment', label: 'Equipos instalados', required: true, help: 'Añade antena, router Peplink, SIM… El nº de serie/kit y el ICCID se copian tal cual.' },
      ],
    },
    {
      id: 'network',
      title: 'Red',
      fields: [
        { key: 'starlink_mode', type: 'select', label: 'Modo Starlink', options: OPT.starlinkMode, half: true },
        { key: 'ip_type', type: 'select', label: 'Tipo de IP', options: OPT.ipType, half: true },
        { key: 'ip', type: 'text', label: 'Dirección IP', half: true, showIf: (d) => d.ip_type === 'Static IP' },
        { key: 'mask', type: 'text', label: 'Máscara de subred', half: true, placeholder: '255.255.255.0', showIf: (d) => d.ip_type === 'Static IP' },
        { key: 'gateway', type: 'text', label: 'Puerta de enlace', half: true, showIf: (d) => d.ip_type === 'Static IP' },
        { key: 'dns', type: 'text', label: 'DNS', half: true, showIf: (d) => d.ip_type === 'Static IP' },
        { key: 'wan_port', type: 'select', label: 'Puerto Peplink para Starlink', options: OPT.wanPort, half: true },
        { key: 'wan_priority', type: 'select', label: 'Prioridad', options: OPT.priority, half: true },
        { key: 'cellular', type: 'select', label: 'Backup celular', options: OPT.cellular, half: true },
        { key: 'network_notes', type: 'textarea', label: 'Notas de red', translatable: true },
      ],
    },
    {
      id: 'install',
      title: 'Instalación',
      fields: [
        { key: 'info_mount', type: 'info', label: 'La antena y su montura se eligen en "Equipos".' },
        { key: 'mount_surface', type: 'select', label: 'Superficie de montaje', options: OPT.surface, allowOther: true },
        { key: 'mount_notes', type: 'textarea', label: 'Detalles del montaje de la antena', translatable: true, placeholder: 'Ej.: base fijada con tornillería; orientación automática' },
        { key: 'cable_length', type: 'number', label: 'Longitud de cable instalada', unit: 'm', half: true },
        { key: 'cable_entry', type: 'select', label: 'Entrada al edificio', options: OPT.entry, allowOther: true, half: true },
        { key: 'cable_protection', type: 'chips', label: 'Protección del cable', options: OPT.protection, allowOther: true },
        { key: 'cable_notes', type: 'textarea', label: 'Recorrido del cable', translatable: true },
        { key: 'rack_location', type: 'text', label: 'Ubicación del rack', translatable: true },
        { key: 'connections', type: 'chips', label: 'Conexiones realizadas', options: OPT.connections, allowOther: true },
        { key: 'power', type: 'chips', label: 'Alimentación', options: OPT.power, allowOther: true },
        { key: 'rack_notes', type: 'textarea', label: 'Notas del rack', translatable: true },
      ],
    },
    {
      id: 'tests',
      title: 'Pruebas',
      fields: [
        { key: 'sl_tests', type: 'antennaTests', label: 'Pruebas Starlink (una por antena)' },
        { key: 'pp_tests', type: 'chips', label: 'Pruebas Peplink realizadas (marca SOLO lo comprobado)', options: OPT.peplinkTests, allowOther: true },
        { key: 'pp_notes', type: 'textarea', label: 'Notas Peplink', translatable: true },
      ],
    },
    {
      id: 'result',
      title: 'Resultado',
      fields: [
        { key: 'final_status', type: 'select', label: 'Estado final', options: OPT.finalStatus, required: true },
        { key: 'pending', type: 'textarea', label: 'Tareas pendientes', translatable: true, showIf: (d) => d.final_status && d.final_status !== 'Completed' },
        { key: 'issues', type: 'textarea', label: 'Incidencias', translatable: true },
        { key: 'recommendations', type: 'textarea', label: 'Recomendaciones', translatable: true },
        { key: 'final_notes', type: 'textarea', label: 'Observaciones finales', translatable: true },
      ],
    },
    {
      id: 'photos',
      title: 'Fotos',
      fields: [
        { key: 'ph_ext', type: 'photos', label: 'Fotos exteriores', photoCategory: 'EXTERIOR' },
        { key: 'ph_int', type: 'photos', label: 'Fotos interiores', photoCategory: 'INTERIOR' },
        { key: 'ph_speed', type: 'photos', label: 'Speed tests', photoCategory: 'SPEED TESTS' },
      ],
    },
    englishStep,
    outputStep,
  ],
};

export const TEMPLATES = { survey: SURVEY, installation: INSTALLATION };

export function allFields(t) {
  return t.steps.flatMap((s) => s.fields);
}

/** Campos obligatorios vacíos (solo los visibles). */
export function missingRequired(t, d) {
  const out = [];
  for (const s of t.steps) for (const f of s.fields) {
    if (!f.required || (f.showIf && !f.showIf(d))) continue;
    const v = d[f.key];
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0)
      || (typeof v === 'object' && !Array.isArray(v) && 'values' in v && !v.values?.length && !v.other)
      || (f.type === 'people' && !(v?.ids?.length || v?.other));
    if (empty) out.push({ step: s.title, label: f.label });
  }
  return out;
}

/** Valores iniciales de un informe nuevo. */
export function initialData(t, myId) {
  const d = {};
  for (const f of allFields(t)) {
    if (f.defaultValue === 'today') d[f.key] = new Date().toISOString().slice(0, 10);
    else if (f.defaultValue !== undefined) d[f.key] = f.defaultValue;
  }
  d.technicians = { ids: [myId], other: '' };
  return d;
}
