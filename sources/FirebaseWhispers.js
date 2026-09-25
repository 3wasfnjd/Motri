import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import {
    collection,
    doc,
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
