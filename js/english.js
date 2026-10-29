import { TEMPLATES, allFields } from './templates.js';
export function getTranslatables(r, photos) {
    const t = TEMPLATES[r.type];
    const d = r.data;
    const out = [];
    const push = (path, label, text) => {
        if (typeof text === 'string' && text.trim())
            out.push({ path, label, text: text.trim() });
    };
    for (const f of allFields(t)) {
        if (f.showIf && !f.showIf(d))
            continue;
        const v = d[f.key];
        if (f.type === 'textarea' || (f.type === 'text' && f.translatable))
            push(f.key, f.label, v);
        if (f.type === 'chips' && f.allowOther && f.translatable !== false)
            push(`${f.key}.other`, `${f.label} (otro)`, v?.other);
        if (f.type === 'select' && f.allowOther && v === '__other')
            push(`${f.key}_other`, f.label, d[`${f.key}_other`]);
        if (f.type === 'segments')
            v?.forEach((s, i) => push(`${f.key}.${s.id}.desc`, `${f.label} – tramo ${i + 1}`, s.desc));
        if (f.type === 'equipment')
            v?.forEach((e) => push(`${f.key}.${e.id}.notes`, `Notas equipo ${e.model || ''}`, e.notes));
    }
    photos.forEach((p, i) => push(`photo.${p.id}`, `Foto ${i + 1} (${p.category})`, p.caption));
    return out;
}
/** Estado de traducción de un texto. */
export function trState(english, item) {
    const e = english[item.path];
    if (!e)
        return 'missing';
    if (e.status === 'failed')
        return 'failed';
    if (e.src !== item.text)
        return 'outdated';
    return e.status === 'edited' ? 'edited' : 'ok';
}
const PHOTO_ORDER = ['EXTERIOR', 'INTERIOR', 'SKY VIEW', 'SPEED TESTS'];
export function formatDate(iso) {
    if (!iso)
        return '';
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d)
        return iso;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
const clean = (s) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
const lc1 = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
export function buildDoc(ctx) {
    const { report, photos, people } = ctx;
    const d = report.data ?? {};
    const english = report.english ?? {};
    const warnings = new Set();
    const t = TEMPLATES[report.type];
    const fieldByKey = Object.fromEntries(allFields(t).map((f) => [f.key, f]));
    const visible = (k) => { const f = fieldByKey[k]; return !f?.showIf || f.showIf(d); };
    // Traducción de un texto libre (si no hay traducción válida, se usa el original y se avisa)
    const tx = (path, text, label) => {
        if (typeof text !== 'string' || !text.trim())
            return '';
        const src = text.trim();
        const e = english[path];
        if (e && e.src === src && e.status !== 'failed' && e.en.trim())
            return e.en.trim();
        warnings.add(`Sin traducir: ${label ?? fieldByKey[path.split('.')[0]]?.label ?? path}`);
        return src;
    };
    const txt = (k) => (visible(k) ? tx(k, d[k]) : '');
    const sel = (k) => {
        if (!visible(k))
            return '';
        const v = d[k];
        if (v === '__other')
            return tx(`${k}_other`, d[`${k}_other`]);
        return typeof v === 'string' ? v : '';
    };
    const chips = (k) => {
        if (!visible(k))
            return [];
        const v = d[k];
        const arr = [...(v?.values ?? [])];
        const other = fieldByKey[k]?.translatable === false ? (v?.other ?? '').trim() : tx(`${k}.other`, v?.other);
        if (other)
            arr.push(...other.split(/\n|;/).map((s) => s.trim()).filter(Boolean));
        return arr;
    };
    const peopleNames = (k) => {
        const v = d[k];
        const names = (v?.ids ?? []).map((id) => people.find((p) => p.id === id)?.full_name).filter(Boolean);
        if (v?.other?.trim())
            names.push(...v.other.split(',').map((s) => s.trim()).filter(Boolean));
        return names.join(', ');
    };
    const nv = (k, unit) => { const n = visible(k) ? num(d[k]) : null; return n == null ? '' : `${n} ${unit}`; };
    const client = sel('client');
    const siteCode = (d.site_code ?? '').trim();
    const siteName = (d.site_name ?? '').trim();
    const isSurvey = report.type === 'survey';
    const equipmentRows = (key) => (d[key] ?? []).filter((e) => e.model || e.modelOther).map((e) => {
        const model = e.model === '__other' ? (e.modelOther ?? '') : e.model;
        const qty = e.qty && e.qty > 1 ? ` (x${e.qty})` : '';
        const mount = e.mount === '__other' ? (e.mountOther ?? '').trim() : e.mount;
        return { label: `${model}${qty}`, value: [e.serial?.trim(), mount ? `Mount: ${mount}` : ''].filter(Boolean).join(' – ') };
    });
    const sections = [];
    const add = (title, blocks) => {
        const b = blocks.filter((x) => !!x && (x.type !== 'p' || !!x.text) && (x.type !== 'bullets' || x.items.length > 0) && (x.type !== 'kv' || x.rows.length > 0));
        if (b.length)
            sections.push({ title, blocks: b });
    };
    const P = (text, bold = false) => (text ? { type: 'p', text, bold } : null);
    const B = (items) => (items.length ? { type: 'bullets', items } : null);
    const KV = (rows) => { const r = rows.filter(([, v]) => !!v); return r.length ? { type: 'kv', rows: r } : null; };
    const summary = [];
    let objective = [];
    let network = [];
    let result = '';
    if (isSurvey) {
        // ---------------- SURVEY ----------------
        objective = chips('objective');
        const objNotes = txt('objective_notes');
        const siteRef = [client, siteCode, siteName].filter(Boolean).join(' ');
        add('Purpose of the visit', [
            P(objective.length ? `The technical visit carried out on site ${siteRef} aimed to:` : ''),
            B(objective.map((s) => lc1(s))),
            P(objNotes),
        ]);
        const am = (d.antenna ?? {});
        const mount = am.mount === '__other' ? (am.mountOther ?? '').trim() : am.mount ?? '';
        const loc = chips('location');
        add('Proposed Starlink antenna location', [
            KV([
                ['Antenna', am.antenna ?? ''],
                ['Location', loc.join(', ')],
                ['Surface', sel('surface')],
                ['Mount', mount],
                ['Sky view (Starlink app)', sel('sky_view')],
            ]),
            P(d.no_drilling ? 'No drilling is recommended, in order to preserve the integrity and waterproofing of the roof.' : ''),
            P(txt('antenna_notes')),
        ]);
        const segs = (d.route_segments ?? []).filter((s) => s.desc || s.length);
        const total = segs.reduce((a, s) => a + (num(s.length) ?? 0), 0);
        const cable = d.route_cable === '__other' ? (d.route_cable_other ?? '') : (d.route_cable ?? '');
        const protection = chips('route_protection');
        if (d.initial_route) {
            const reasons = chips('initial_reasons');
            const retained = sel('initial_retained');
            add('Analysis of the initially proposed route', [
                P(`The cable route initially proposed${client ? ` by ${client}` : ''} was inspected during the visit.`),
                KV([['Estimated length', nv('initial_length', 'm')], ['Decision', retained]]),
                P(retained === 'Not retained' && reasons.length ? 'This route was not retained for the following reasons:' : ''),
                retained === 'Not retained' ? B(reasons.map(lc1)) : null,
            ]);
        }
        add('Recommended cable route', [
            P(segs.length ? 'Following the site inspection, the following route is proposed:' : ''),
            B(segs.map((s, i) => [s.length ? `${s.length} m` : '', tx(`route_segments.${s.id}.desc`, s.desc, `Tramo ${i + 1}`)].filter(Boolean).join(' – '))),
            KV([
                ['Estimated total length', total ? `approx. ${total} m` : ''],
                ['Recommended cable', cable],
                ['Cable protection', protection.join(', ')],
                ['Intermediate switch', d.switch_needed === true ? 'Required' : d.switch_needed === false ? 'Not required with the proposed route' : ''],
            ]),
            P(txt('route_notes')),
        ]);
        const access = chips('access');
        add('Work at height and access', [
            B(access),
            KV([['Maximum MEWP height', nv('mewp_height', 'm')]]),
            P(txt('access_notes')),
        ]);
        const dest = chips('destination');
        add('Arrival at the network infrastructure', [
            KV([['Destination', dest.join(', ')]]),
            P(txt('destination_notes')),
        ]);
        const onsite = equipmentRows('onsite_equipment');
        add('Equipment already available on site', [
            B(onsite.map((e) => (e.value ? `${e.label} – ${e.value}` : e.label))),
            P(txt('onsite_notes')),
        ]);
        const materials = chips('materials');
        add('Materials to be supplied', [
            P(materials.length ? 'Before planning the installation, the following items must be provided:' : ''),
            B(materials),
            P(txt('materials_notes')),
        ]);
        const ppe = chips('ppe');
        const safety = chips('safety');
        add('Safety and PPE', [
            P(ppe.length ? 'Mandatory PPE:' : '', true),
            B(ppe),
            P(safety.length ? 'Safety requirements:' : '', true),
            B(safety),
            P(txt('safety_notes')),
        ]);
        result = sel('feasibility');
        add('Conclusion', [
            P(result ? `Result: ${result}.` : '', true),
            P(txt('conditions')),
            P(txt('conclusion')),
            P(txt('next_steps') ? `Next steps: ${txt('next_steps')}` : ''),
        ]);
        // Tabla resumen técnico (solo filas con dato)
        const initial = d.initial_route
            ? [nv('initial_length', 'm') ? `${nv('initial_length', 'm')}` : '', sel('initial_retained')].filter(Boolean).join(' – ')
            : '';
        [
            ['Site', [client, siteCode, siteName].filter(Boolean).join(' ')],
            ['GPS', (d.gps ?? '').trim()],
            ['Installation', am.antenna ?? ''],
            ['Location', loc.join(', ')],
            ['Mount', mount],
            ['Initial route', initial],
            ['Proposed route', total ? `Approx. ${total} m` : ''],
            ['Cable', cable],
            ['Cable protection', protection.join(', ')],
            ['Intermediate switch', d.switch_needed === true ? 'Required' : d.switch_needed === false ? 'Not required' : ''],
            ['Destination', dest.join(', ')],
            ['Access', [access.join(', '), nv('mewp_height', 'm') ? `max. ${nv('mewp_height', 'm')}` : ''].filter(Boolean).join(' – ')],
            ['PPE', ppe.length ? 'Mandatory' : ''],
            ['Result', result],
        ].forEach((r) => r[1] && summary.push(r));
    }
    else {
        // ---------------- INSTALLATION ----------------
        const eq = d.equipment ?? [];
        const ant = eq.find((e) => e.kind === 'antenna');
        const pep = eq.find((e) => e.manufacturer === 'Peplink' && e.kind === 'router');
        const sim = eq.find((e) => e.kind === 'sim');
        const modelOf = (e) => (e ? (e.model === '__other' ? e.modelOther ?? '' : e.model) : '');
        network = [
            ['Starlink mode', sel('starlink_mode')],
            ['IP type', sel('ip_type')],
            ['IP Address', visible('ip') ? (d.ip ?? '').trim() : ''],
            ['Subnet Mask', visible('mask') ? (d.mask ?? '').trim() : ''],
            ['Default Gateway', visible('gateway') ? (d.gateway ?? '').trim() : ''],
            ['DNS', visible('dns') ? (d.dns ?? '').trim() : ''],
        ].filter(([, v]) => v);
        const connections = chips('connections');
        const power = chips('power');
        const surface = sel('mount_surface');
        add('Installation Steps', []);
        add('2.1 Antenna Mounting', [
            KV([['Antenna', modelOf(ant)], ['Mount', ant?.mount === '__other' ? ant?.mountOther ?? '' : ant?.mount ?? ''], ['Surface', surface]]),
            P(txt('mount_notes')),
        ]);
        add('2.2 Cable Routing', [
            KV([
                ['Building entry', sel('cable_entry')],
                ['Cable protection', chips('cable_protection').join(', ')],
                ['Total cable length installed', nv('cable_length', 'm')],
            ]),
            P(txt('cable_notes')),
        ]);
        add('2.3 Rack Installation', [
            KV([['Rack location', txt('rack_location')]]),
            P(connections.length ? 'Connections made:' : '', true),
            B(connections),
            P(power.length ? `Power supplied via: ${power.join(', ')}.` : ''),
            P(txt('rack_notes')),
        ]);
        const slLines = [];
        const mode = sel('starlink_mode');
        if (mode)
            slLines.push(`${mode} configured${sel('ip_type') ? ` (${sel('ip_type')})` : ''}.`);
        if (sel('sl_status'))
            slLines.push(`Status: ${sel('sl_status')}.`);
        if (nv('sl_down', 'Mbps'))
            slLines.push(`Download speed: ${nv('sl_down', 'Mbps')}`);
        if (nv('sl_up', 'Mbps'))
            slLines.push(`Upload speed: ${nv('sl_up', 'Mbps')}`);
        if (nv('sl_latency', 'ms'))
            slLines.push(`Latency: ${nv('sl_latency', 'ms')}`);
        if (sel('sl_obstructions'))
            slLines.push(`Obstructions: ${sel('sl_obstructions')}.`);
        add(`3.1 Starlink ${ant?.serial?.trim() || ''}`.trim(), [
            ...slLines.map((l) => P(l)),
            P(txt('sl_notes')),
        ]);
        const wan = sel('wan_port');
        const wanLine = wan ? `${wan} configured${sel('ip_type') ? ` via ${sel('ip_type')}` : ''}${sel('wan_priority') ? `, ${sel('wan_priority')}` : ''}.` : '';
        const cell = sel('cellular');
        const cellLine = cell && cell !== 'Not used' ? `Cellular ${cell}${sim ? `: ${modelOf(sim)} installed` : ''}.` : '';
        const tests = chips('pp_tests');
        add(`3.2 Peplink Router ${pep?.serial?.trim() || modelOf(pep)}`.trim(), [
            P(wanLine),
            P(cellLine),
            P(tests.length ? 'Tests completed successfully:' : '', true),
            B(tests),
            P(txt('pp_notes')),
            P(txt('network_notes')),
        ]);
        result = sel('final_status');
        add('4. Result', [
            KV([['Final status', result]]),
            P(txt('pending') ? `Pending tasks: ${txt('pending')}` : ''),
            P(txt('issues') ? `Issues: ${txt('issues')}` : ''),
            P(txt('recommendations') ? `Recommendations: ${txt('recommendations')}` : ''),
            P(txt('final_notes')),
        ]);
        // Quita la cabecera vacía "Installation Steps" (solo era un separador)
        const i = sections.findIndex((s) => s.title === 'Installation Steps');
        if (i >= 0)
            sections.splice(i, 1);
    }
    // Numeración automática de secciones del survey (1., 2., …)
    if (isSurvey)
        sections.forEach((s, i) => (s.title = `${i + 1}. ${s.title}`));
    const groups = new Map();
    [...photos].sort((a, b) => a.sort - b.sort).forEach((p) => {
        const g = groups.get(p.category) ?? [];
        g.push({ id: p.id, caption: tx(`photo.${p.id}`, p.caption, 'pie de foto'), path: p.path });
        groups.set(p.category, g);
    });
    const title = t.title;
    const siteLine = isSurvey
        ? [client, [siteCode, siteName].filter(Boolean).join(' ')].filter(Boolean).join(' – ')
        : [client, siteCode, siteName].filter(Boolean).join(' - ');
    const prefix = isSurvey ? 'SURVEY' : 'REPORT';
    return {
        kind: report.type,
        title,
        number: report.number ?? '',
        siteLine,
        client, siteCode, siteName,
        contract: (d.contract ?? '').trim(),
        dateText: formatDate(d.date),
        technicians: peopleNames('technicians'),
        supervisor: peopleNames('supervisor'),
        gps: (d.gps ?? '').trim(),
        timeText: [d.start_time, d.end_time].filter(Boolean).join(' – '),
        objective,
        equipment: isSurvey ? [] : equipmentRows('equipment'),
        network,
        sections,
        summary,
        photoGroups: [...groups.entries()].sort((a, b) => PHOTO_ORDER.indexOf(a[0]) - PHOTO_ORDER.indexOf(b[0])).map(([category, ph]) => ({ category, photos: ph })),
        result,
        warnings: [...warnings],
        fileName: clean(`${prefix} - ${[siteCode, siteName].filter(Boolean).join(' - ') || report.number}`) + '.pdf',
    };
}
// ---------- Email ----------
export function emailSubject(m) {
    return [m.title, m.client, [m.siteCode, m.siteName].filter(Boolean).join(' '), m.dateText].filter(Boolean).join(' – ');
}
function blockToText(b) {
    if (b.type === 'p')
        return b.text;
    if (b.type === 'bullets')
        return b.items.map((i) => `• ${i}`).join('\n');
    return b.rows.map(([k, v]) => `${k}: ${v}`).join('\n');
}
export function emailBody(m, opts) {
    const L = [];
    L.push('Hello,', '');
    L.push(`Please find below the ${m.title.toLowerCase()} for site ${m.siteLine}.${opts.pdfAttached ? ' The full PDF report is attached.' : ''}`, '');
    L.push(`Report reference: ${m.number}`);
    if (m.contract)
        L.push(`Contract: ${m.contract}`);
    if (m.dateText)
        L.push(`Date: ${m.dateText}${m.timeText ? ` (${m.timeText})` : ''}`);
    if (m.gps)
        L.push(`Location: ${m.gps}`);
    if (m.technicians)
        L.push(`Technicians: ${m.technicians}`);
    if (m.supervisor)
        L.push(`Supervisor: ${m.supervisor}`);
    if (m.equipment.length) {
        L.push('', 'EQUIPMENT');
        m.equipment.forEach((e) => L.push(`• ${e.label}${e.value ? ` – ${e.value}` : ''}`));
    }
    if (m.network.length) {
        L.push('', 'NETWORK CONFIGURATION');
        m.network.forEach(([k, v]) => L.push(`${k}: ${v}`));
    }
    for (const s of m.sections) {
        L.push('', s.title.toUpperCase());
        s.blocks.forEach((b) => L.push(blockToText(b)));
    }
    if (m.summary.length) {
        L.push('', 'TECHNICAL SUMMARY');
        m.summary.forEach(([k, v]) => L.push(`${k}: ${v}`));
    }
    L.push('', 'Best regards,');
    if (opts.signature)
        L.push(opts.signature);
    return L.join('\n');
}
// ---------- WhatsApp (compacto) ----------
export function whatsappText(m) {
    const L = [];
    L.push(`*${m.title} – ${m.siteLine}*`);
    L.push(`Ref: ${m.number}${m.contract ? ` | Contract: ${m.contract}` : ''}`);
    if (m.dateText)
        L.push(`Date: ${m.dateText}${m.timeText ? ` (${m.timeText})` : ''}`);
    if (m.gps)
        L.push(`Location: ${m.gps}`);
    if (m.technicians)
        L.push(`Team: ${m.technicians}`);
    L.push('');
    if (m.kind === 'survey') {
        const pick = (k) => m.summary.find(([a]) => a === k)?.[1];
        const work = [
            pick('Installation') && `Antenna: ${pick('Installation')}`,
            pick('Location') && `Location: ${pick('Location')}`,
            pick('Mount') && `Mount: ${pick('Mount')}`,
            pick('Proposed route') && `Proposed route: ${pick('Proposed route')}`,
            pick('Cable') && `Cable: ${pick('Cable')}`,
            pick('Access') && `Access: ${pick('Access')}`,
        ].filter(Boolean);
        if (work.length) {
            L.push('*Survey*');
            work.forEach((w) => L.push(`• ${w}`));
        }
        const mat = m.sections.find((s) => s.title.includes('Materials'));
        const matItems = mat?.blocks.find((b) => b.type === 'bullets');
        if (matItems?.items.length) {
            L.push('', '*To be supplied*');
            matItems.items.forEach((i) => L.push(`• ${i}`));
        }
    }
    else {
        if (m.equipment.length) {
            L.push('*Equipment*');
            m.equipment.forEach((e) => L.push(`• ${e.label}${e.value ? ` – ${e.value}` : ''}`));
        }
        const tests = m.sections.filter((s) => s.title.startsWith('3.'));
        if (tests.length) {
            L.push('', '*Tests*');
            tests.forEach((s) => s.blocks.forEach((b) => {
                if (b.type === 'p' && !b.bold)
                    L.push(`• ${b.text}`);
                if (b.type === 'bullets')
                    b.items.forEach((i) => L.push(`• ${i}`));
            }));
        }
        const res = m.sections.find((s) => s.title.startsWith('4.'));
        res?.blocks.forEach((b) => { if (b.type === 'p')
            L.push(b.text); });
    }
    if (m.result)
        L.push('', `*Result:* ${m.result}`);
    return L.join('\n');
}
