import { useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, limit, addDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import useStore from '../store/useStore';
import type { EventType } from '../store/useStore';

const VALID_EVENT_TYPES = new Set<EventType>([
    'tachycardia', 'bradycardia',
    'spo2_drop',
    'hyperthermia', 'hypothermia',
    'tachypnea', 'bradypnea',
    'hypertension', 'hypotension',
]);

// ─── Singleton para IDs ya procesados ────────────────────────────────────────
export const processedFirestoreIds = new Set<string>();

// ─── Guardar evento con snapshot de vitales ───────────────────────────────────

export async function saveEventWithVitals(
    event: {
        type: EventType;
        label: string;
        severity: 'high' | 'medium';
        timestampEpoch: number;
    },
    vitals: {
        hr: number;
        spo2: number;
        temp: number;
        rr: number;
        bp: string;
    },
    userId: string
): Promise<string | null> {
    try {
        const ref = await addDoc(collection(db, 'events'), {
            type: event.type,
            label: event.label,
            severity: event.severity,
            timestamp: event.timestampEpoch,
            userId,
            vitals: {
                hr: vitals.hr,
                spo2: vitals.spo2,
                temp: vitals.temp,
                rr: vitals.rr,
                bp: vitals.bp,
            },
        });
        return ref.id;
    } catch (err) {
        console.error('[saveEventWithVitals] Error:', err);
        return null;
    }
}

// ─── Helper: convierte timestamp de Firestore a epoch number ─────────────────
// El campo puede llegar como: número epoch, Firestore Timestamp object, o nulo

function toEpoch(raw: unknown): number {
    if (!raw) return Date.now();
    // Firestore Timestamp object { seconds, nanoseconds }
    if (typeof raw === 'object' && 'seconds' in (raw as object)) {
        return (raw as { seconds: number }).seconds * 1000;
    }
    // Ya es número
    if (typeof raw === 'number') return raw;
    return Date.now();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFirestore() {
    const addEvent    = useStore(s => s.addEvent);
    const currentUser = useStore(s => s.currentUser);

    useEffect(() => {
        if (!currentUser) return;

        const q = query(
            collection(db, 'events'),
            where('userId', '==', currentUser.uid),
            orderBy('timestamp', 'desc'),
            limit(200)
        );

        const unsub = onSnapshot(q, (snap) => {
            snap.docChanges().forEach((change) => {
                if (change.type !== 'added') return;

                const docId = change.doc.id;

                // Si el ID ya está en el Set, lo escribimos nosotros — skip
                if (processedFirestoreIds.has(docId)) return;
                processedFirestoreIds.add(docId);

                const d = change.doc.data();

                if (!VALID_EVENT_TYPES.has(d.type as EventType)) {
                    console.warn('[useFirestore] unknown event type:', d.type);
                    return;
                }

                addEvent({
                    type: d.type as EventType,
                    label: d.label ?? d.type,
                    severity: d.severity ?? 'high',
                    timestampEpoch: toEpoch(d.timestamp),
                    skipAlert: true,  // ← eventos de historial no generan alerta en el panel
                });
            });
        }, (err) => console.error('[useFirestore] events:', err));

        return () => unsub();
    }, [addEvent, currentUser]);
}
