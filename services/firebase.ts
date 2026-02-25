import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Firebase 설정 (ai-travel-planner-v2-3904)
const firebaseConfig = {
    apiKey: "TODO_REPLACE_WITH_ACTUAL_IF_POSSIBLE", // MCP 도구 오류 시 사용자 환경에서 확인 필요
    authDomain: "ai-travel-planner-v2-3904.firebaseapp.com",
    projectId: "ai-travel-planner-v2-3904",
    storageBucket: "ai-travel-planner-v2-3904.firebasestorage.app",
    messagingSenderId: "1055776715526",
    appId: "TODO_REPLACE_WITH_ACTUAL_IF_POSSIBLE"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
