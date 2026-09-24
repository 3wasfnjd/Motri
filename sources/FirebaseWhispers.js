const firebaseConfig = Object.freeze({
    apiKey: 'AIzaSyBbyByEIqSslyNhQvv3ed-HQhF-43fK_Wk',
    authDomain: 'motri-4ed44.firebaseapp.com',
    projectId: 'motri-4ed44',
    storageBucket: 'motri-4ed44.firebasestorage.app',
    messagingSenderId: '241178340893',
    appId: '1:241178340893:web:8a01dbbf985a074e52e0f4'
})

const FIREBASE_VERSION = '12.19.0'
let clientPromise = null

async function createClient()
{
    const [appSdk, authSdk, firestoreSdk] = await Promise.all([
        import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
        import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
        import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`)
    ])

    const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(firebaseConfig)
    const auth = authSdk.getAuth(app)
    const db = firestoreSdk.getFirestore(app)

    if(!auth.currentUser)
        await authSdk.signInAnonymously(auth)

    return { auth, db, firestoreSdk }
}

function getClient()
{
    if(!clientPromise)
        clientPromise = createClient()

    return clientPromise
}

export async function subscribeToWhispers(count, onChange, onError)
{
    const { db, firestoreSdk } = await getClient()
    const collectionRef = firestoreSdk.collection(db, 'whispers')
    const whisperQuery = firestoreSdk.query(
        collectionRef,
        firestoreSdk.orderBy('createdAt', 'desc'),
        firestoreSdk.limit(count)
    )

    return firestoreSdk.onSnapshot(
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
    const { auth, db, firestoreSdk } = await getClient()
    const user = auth.currentUser

    if(!user)
        throw new Error('Anonymous Firebase user is not available')

    const documentRef = firestoreSdk.doc(db, 'whispers', user.uid)

    await firestoreSdk.setDoc(documentRef, {
        message,
        countryCode,
        x,
        y,
        z,
        createdAt: firestoreSdk.serverTimestamp()
    })
}
