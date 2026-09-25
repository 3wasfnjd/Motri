import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import {
    collection,
    doc,
    getDoc,
    getFirestore,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc
} from 'firebase/firestore'

const firebaseConfig = Object.freeze({
    apiKey: 'AIzaSyBbyByEIqSslyNhQvv3ed-HQhF-43fK_Wk',
    authDomain: 'motri-4ed44.firebaseapp.com',
    projectId: 'motri-4ed44',
    storageBucket: 'motri-4ed44.firebasestorage.app',
    messagingSenderId: '241178340893',
    appId: '1:241178340893:web:8a01dbbf985a074e52e0f4'
})

let clientPromise = null

async function createClient()
{
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
    const auth = getAuth(app)
    const db = getFirestore(app)

    if(!auth.currentUser)
        await signInAnonymously(auth)

    return { auth, db }
}

function getClient()
{
    if(!clientPromise)
        clientPromise = createClient().catch(error =>
        {
            clientPromise = null
            throw error
        })

    return clientPromise
}

export function firebaseErrorText(error)
{
    const code = error?.code || ''
    if(code === 'auth/operation-not-allowed')
        return 'الدخول المجهول غير مفعّل في Firebase'
    if(code === 'auth/admin-restricted-operation')
        return 'إنشاء حسابات الزوار معطّل في Authentication > Settings > User actions'
    if(code === 'auth/unauthorized-domain')
        return 'نطاق GitHub Pages غير مضاف في Authorized domains'
    if(code === 'permission-denied' || code === 'firestore/permission-denied')
        return 'قواعد Firestore تمنع الوصول'
    if(code === 'unavailable' || code === 'firestore/unavailable')
        return 'خدمة Firebase غير متاحة مؤقتًا'

    return code || error?.message || 'خطأ غير معروف'
}

export async function subscribeToWhispers(count, onChange, onError)
{
    const { db } = await getClient()
    const whisperQuery = query(
        collection(db, 'whispers'),
        orderBy('createdAt', 'desc'),
        limit(count)
    )

    return onSnapshot(
        whisperQuery,
        (snapshot) =>
        {
            for(const change of snapshot.docChanges())
                onChange({ type: change.type, id: change.doc.id, data: change.doc.data() })
        },
        onError
    )
}

export function getCircuitDayInfo(now = Date.now())
{
    const shifted = new Date(now + 3 * 60 * 60 * 1000)
    const dayKey = shifted.toISOString().slice(0, 10)
    const [year, month, day] = dayKey.split('-').map(Number)
    const startTime = Date.UTC(year, month - 1, day) - 3 * 60 * 60 * 1000

    return { dayKey, startTime }
}

export async function subscribeToCircuitLeaderboard(maxScores, onScores, onError)
{
    const { db } = await getClient()
    const { dayKey } = getCircuitDayInfo()
    const scoresQuery = query(
        collection(db, 'circuitLeaderboard', dayKey, 'scores'),
        orderBy('duration', 'asc'),
        limit(maxScores)
    )

    return {
        dayKey,
        unsubscribe: onSnapshot(
            scoresQuery,
            (snapshot) =>
            {
                onScores(snapshot.docs.map(item =>
                {
                    const data = item.data()
                    return [ data.tag, data.countryCode || '', data.duration ]
                }))
            },
            onError
        )
    }
}

export async function publishCircuitScore({ tag, countryCode, duration })
{
    const { auth, db } = await getClient()
    const user = auth.currentUser

    if(!user)
        throw new Error('Anonymous Firebase user is not available')

    const { dayKey } = getCircuitDayInfo()
    const scoreRef = doc(db, 'circuitLeaderboard', dayKey, 'scores', user.uid)
    const current = await getDoc(scoreRef)

    if(current.exists() && Number(current.data().duration) <= duration)
        return { updated: false, dayKey }

    await setDoc(scoreRef, {
        tag,
        countryCode,
        duration,
        createdAt: serverTimestamp()
    })

    return { updated: true, dayKey }
}

export async function publishWhisper({ message, countryCode, x, y, z })
{
    const { auth, db } = await getClient()
    const user = auth.currentUser

    if(!user)
        throw new Error('Anonymous Firebase user is not available')

    await setDoc(doc(db, 'whispers', user.uid), {
        message,
        countryCode,
        x,
        y,
        z,
        createdAt: serverTimestamp()
    })
}
