/**
 * Solocorn Landing Page - Coming Soon Mode with i18n and Themes
 * Landing page with early bird signup, special developer access, language selector, and theme system
 */

'use client'

import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserPlus,
  GraduationCap,
  School,
  Building2,
  Mail,
  ChevronLeft,
  ChevronRight,
  X,
  Lock,
  CheckCircle,
  Sparkles,
  Globe,
  Atom,
  Hexagon,
  Triangle,
  Circle,
  Square,
  Send,
  MessageCircle,
  BookOpen,
  CalendarDays,
  Calculator,
  FlaskConical,
  Languages,
  History,
  Music,
  Palette as ArtIcon,
  Code,
  Trophy,
  Search,
  Users,
  User,
  Award,
  Flag,
  Wrench,
  Clock,
  Check,
  Settings,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogPanel,
} from '@/components/ui/dialog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  REGIONS,
  GLOBAL_EXAMS_CATEGORIES,
  AP_CATEGORIES,
  A_LEVEL_CATEGORIES,
  IB_CATEGORIES,
  IGCSE_CATEGORIES,
  NATIONAL_EXAMS_DATA,
  UNIVERSITY_CATEGORIES,
  LANGUAGE_CATEGORIES,
  PROFESSIONAL_CATEGORIES,
  UNIVERSITIES_BY_COUNTRY_CODE,
  ALL_COUNTRIES,
  type ExamCategory,
} from '@/lib/data/tutor-categories'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// --- Types ---
type ModalType = 'register' | 'tutor' | 'academy' | 'schools' | null
type Language = 'en' | 'zh-CN' | 'zh-HK' | 'es' | 'fr' | 'de' | 'ja' | 'ko' | 'pt' | 'hi'
type ThemeMode = 'light' | 'dark'
type ColorTheme = 'emerald' | 'ocean' | 'sunset' | 'galaxy'

interface EarlyBirdForm {
  email: string
  name: string
}

interface Translations {
  [key: string]: {
    [lang in Language]: string
  }
}

// --- Theme Configurations ---
const THEMES: Record<
  ColorTheme,
  {
    name: string
    icon: string
    colors: {
      primary: string
      secondary: string
      accent: string
      bg: string
      surface: string
      text: string
      muted: string
    }
  }
> = {
  emerald: {
    name: 'Emerald Dreams',
    icon: '🌿',
    colors: {
      primary: '#10b981',
      secondary: '#06b6d4',
      accent: '#8b5cf6',
      bg: 'from-slate-950 via-zinc-950 to-slate-900',
      surface: 'bg-zinc-900/60',
      text: 'text-zinc-100',
      muted: 'text-zinc-500',
    },
  },
  ocean: {
    name: 'Deep Ocean',
    icon: '🌊',
    colors: {
      primary: '#0ea5e9',
      secondary: '#6366f1',
      accent: '#ec4899',
      bg: 'from-slate-950 via-blue-950 to-slate-900',
      surface: 'bg-blue-950/60',
      text: 'text-blue-50',
      muted: 'text-blue-400/70',
    },
  },
  sunset: {
    name: 'Golden Sunset',
    icon: '🌅',
    colors: {
      primary: '#f59e0b',
      secondary: '#ef4444',
      accent: '#ec4899',
      bg: 'from-orange-950 via-red-950 to-slate-900',
      surface: 'bg-orange-950/60',
      text: 'text-orange-50',
      muted: 'text-orange-400/70',
    },
  },
  galaxy: {
    name: 'Cosmic Galaxy',
    icon: '🌌',
    colors: {
      primary: '#a855f7',
      secondary: '#ec4899',
      accent: '#3b82f6',
      bg: 'from-purple-950 via-fuchsia-950 to-slate-900',
      surface: 'bg-purple-950/60',
      text: 'text-purple-50',
      muted: 'text-purple-400/70',
    },
  },
}

import { LANDING_CATEGORIES as CATEGORIES } from '@/lib/data/landing-categories'

// --- Translations ---
const translations: Translations = {
  // Navbar
  brandName: {
    en: 'Solocorn.co',
    'zh-CN': 'Solocorn.co',
    'zh-HK': 'Solocorn.co',
    es: 'Solocorn.co',
    fr: 'Solocorn.co',
    de: 'Solocorn.co',
    ja: 'Solocorn.co',
    ko: 'Solocorn.co',
    pt: 'Solocorn.co',
    hi: 'Solocorn.co',
  },
  register: {
    en: 'Register',
    'zh-CN': '注册',
    'zh-HK': '註冊',
    es: 'Registrarse',
    fr: "S'inscrire",
    de: 'Registrieren',
    ja: '登録',
    ko: '등록',
    pt: 'Registrar',
    hi: 'पंजीकरण',
  },

  // Hero Section
  comingSoon: {
    en: 'Coming Soon',
    'zh-CN': '即将推出',
    'zh-HK': '即將推出',
    es: 'Próximamente',
    fr: 'Bientôt disponible',
    de: 'Demnächst verfügbar',
    ja: 'まもなく公開',
    ko: '곧 출시',
    pt: 'Em breve',
    hi: 'जल्द आ रहा है',
  },
  launch: {
    en: 'Launch',
    'zh-CN': '启动',
    'zh-HK': '啟動',
    es: 'Lanzar',
    fr: 'Lancer',
    de: 'Starten',
    ja: 'ローンチ',
    ko: '출시',
    pt: 'Lançar',
    hi: 'लॉन्च',
  },

  // Tutor Section
  solocornTutors: {
    en: 'Solocorn Tutors',
    'zh-CN': 'Solocorn 导师',
    'zh-HK': 'Solocorn 導師',
    es: 'Tutores de Solocorn',
    fr: 'Tuteurs Solocorn',
    de: 'Solocorn-Tutoren',
    ja: 'Solocorn チューター',
    ko: 'Solocorn 튜터',
    pt: 'Tutores Solocorn',
    hi: 'Solocorn शिक्षक',
  },
  viewAllCategories: {
    en: 'View all Categories',
    'zh-CN': '查看所有类别',
    'zh-HK': '查看所有類別',
    es: 'Ver todas las categorías',
    fr: 'Voir toutes les catégories',
    de: 'Alle Kategorien anzeigen',
    ja: 'すべてのカテゴリを表示',
    ko: '모든 카테고리 보기',
    pt: 'Ver todas as categorias',
    hi: 'सभी श्रेणियाँ देखें',
  },

  // Special Access
  accessWithCode: {
    en: 'Access with code',
    'zh-CN': '使用代码访问',
    'zh-HK': '使用代碼訪問',
    es: 'Acceso con código',
    fr: 'Accès avec code',
    de: 'Zugang mit Code',
    ja: 'コードでアクセス',
    ko: '코드로 접근',
    pt: 'Acesso com código',
    hi: 'कोड के साथ पहुंच',
  },
  enterCode: {
    en: 'Enter code',
    'zh-CN': '输入代码',
    'zh-HK': '輸入代碼',
    es: 'Ingresar código',
    fr: 'Entrer le code',
    de: 'Code eingeben',
    ja: 'コードを入力',
    ko: '코드 입력',
    pt: 'Digite o código',
    hi: 'कोड दर्ज करें',
  },
  access: {
    en: 'Access',
    'zh-CN': '访问',
    'zh-HK': '訪問',
    es: 'Acceder',
    fr: 'Accéder',
    de: 'Zugang',
    ja: 'アクセス',
    ko: '액세스',
    pt: 'Acessar',
    hi: 'पहुंच',
  },
  invalidCode: {
    en: 'Invalid access code',
    'zh-CN': '无效的访问代码',
    'zh-HK': '無效嘅訪問代碼',
    es: 'Código de acceso inválido',
    fr: "Code d'accès invalide",
    de: 'Ungültiger Zugangscode',
    ja: '無効なアクセスコード',
    ko: '잘못된 액세스 코드',
    pt: 'Código de acesso inválido',
    hi: 'अमान्य पहुंच कोड',
  },

  // Action Cards
  becomeTutor: {
    en: 'Pre-register to become a Solocorn Tutor',
    'zh-CN': '预注册成为 Solocorn 导师',
    'zh-HK': '預註冊成為 Solocorn 導師',
    es: 'Pre-regístrate para ser tutor de Solocorn',
    fr: 'Pré-inscrivez-vous pour devenir tuteur Solocorn',
    de: 'Registrieren Sie sich vor, um Solocorn-Tutor zu werden',
    ja: 'Solocorn チューターになるための事前登録',
    ko: 'Solocorn 튜터 되기 사전 등록',
    pt: 'Pré-registre-se para ser Tutor Solocorn',
    hi: 'Solocorn शिक्षक बनने के लिए पूर्व-पंजीकरण',
  },
  becomeTutorDesc: {
    en: 'Join our network of tutors and educators.',
    'zh-CN': '加入我们的精英教育者网络，触达全球学生。',
    'zh-HK': '加入我哋嘅精英教育者網絡，觸達全球學生。',
    es: 'Únase a nuestra red de educadores de élite y llegue a estudiantes de todo el mundo.',
    fr: "Rejoignez notre réseau d'éducateurs d'élite et touchez des étudiants du monde entier.",
    de: 'Treten Sie unserem Netzwerk von Elite-Bildungsexperten bei und erreichen Sie Studenten weltweit.',
    ja: 'エリート教育者ネットワークに参加し、世界中の学生にリーチしましょう。',
    ko: '엘리트 교육자 네트워크에 참여하여 전 세계 학생들에게 다가가세요.',
    pt: 'Junte-se à nossa rede de educadores de elite e alcance estudantes em todo o mundo.',
    hi: 'हमारे精英 शिक्षक नेटवर्क में शामिल हों और दुनियाभर के छात्रों तक पहुंचें।',
  },
  applyToTeach: {
    en: 'Apply',
    'zh-CN': '申请',
    'zh-HK': '申請',
    es: 'Aplicar',
    fr: 'Postuler',
    de: 'Bewerben',
    ja: '応募',
    ko: '지원',
    pt: 'Aplicar',
    hi: 'आवेदन',
  },
  startAcademy: {
    en: 'Solocorn Academy',
    'zh-CN': 'Solocorn 学院',
    'zh-HK': 'Solocorn 學院',
    es: 'Academia Solocorn',
    fr: 'Académie Solocorn',
    de: 'Solocorn-Akademie',
    ja: 'Solocorn アカデミー',
    ko: 'Solocorn 아카데미 시작',
    pt: 'Academia Solocorn',
    hi: 'Solocorn अकादमी',
  },
  startAcademyDesc: {
    en: 'Host your tutors on our platform. Start a new academy.',
    'zh-CN': '在我们的基础设施上建立您自己的品牌学习机构。',
    'zh-HK': '在我哋嘅基礎設施上建立你自己嘅品牌學習機構。',
    es: 'Construya su propia institución de aprendizaje de marca en nuestra infraestructura.',
    fr: "Construisez votre propre institution d'apprentissage de marque sur notre infrastructure.",
    de: 'Bauen Sie Ihre eigene Markenlerninstitution auf unserer Infrastruktur auf.',
    ja: '私たちのインフラストラクチャ上に独自のブランド学習機関を構築してください。',
    ko: '우리의 인프라에서 자신만의 브랜드 학습 기관을 구축하세요.',
    pt: 'Construa sua própria instituição de aprendizagem de marca em nossa infraestrutura.',
    hi: 'हमारे इंफ्रास्ट्रक्चर पर अपना खुद का ब्रांडेड लर्निंग संस्थान बनाएं।',
  },
  launchAcademy: {
    en: 'Launch Academy',
    'zh-CN': '启动学院',
    'zh-HK': '啟動學院',
    es: 'Lanzar academia',
    fr: "Lancer l'académie",
    de: 'Akademie starten',
    ja: 'アカデミーをローンチ',
    ko: '아카데미 출시',
    pt: 'Lançar Academia',
    hi: 'अकादमी लॉन्च करें',
  },
  solocornSchools: {
    en: 'Solocorn Schools',
    'zh-CN': 'Solocorn 学校',
    'zh-HK': 'Solocorn 學校',
    es: 'Escuelas Solocorn',
    fr: 'Écoles Solocorn',
    de: 'Solocorn-Schulen',
    ja: 'Solocorn スクール',
    ko: 'Solocorn 스쿨',
    pt: 'Escolas Solocorn',
    hi: 'Solocorn स्कूल',
  },
  schoolsDesc: {
    en: 'Integrated solutions for K-12 and higher education institutions.',
    'zh-CN': '为K-12和高等教育机构提供集成解决方案。',
    'zh-HK': '為K-12同高等教育機構提供集成解決方案。',
    es: 'Soluciones integradas para instituciones educativas K-12 y superiores.',
    fr: "Solutions intégrées pour les institutions d'enseignement K-12 et supérieur.",
    de: 'Integrierte Lösungen für K-12 und Hochschulen.',
    ja: 'K-12および高等教育機関向けの統合ソリューション。',
    ko: 'K-12 및 고등 교육 기관을 위한 통합 솔루션.',
    pt: 'Soluções integradas para instituições educacionais K-12 e superior.',
    hi: 'K-12 और उच्च शिक्षा संस्थानों के लिए एकीकृत समाधान।',
  },
  partnerWithUs: {
    en: 'Inquire',
    'zh-CN': '咨询',
    'zh-HK': '諮詢',
    es: 'Consultar',
    fr: 'Renseignements',
    de: 'Anfragen',
    ja: 'お問い合わせ',
    ko: '문의',
    pt: 'Consultar',
    hi: 'पूछताछ',
  },

  // Business Section
  businessInquiries: {
    en: 'Business and Licensing Inquiries',
    'zh-CN': '商业和许可咨询',
    'zh-HK': '商業同許可諮詢',
    es: 'Consultas comerciales y de licencias',
    fr: 'Demandes commerciales et de licence',
    de: 'Geschäfts- und Lizenzanfragen',
    ja: 'ビジネスおよびライセンスに関するお問い合わせ',
    ko: '비즈니스 및 라이선스 문의',
    pt: 'Consultas Comerciais e de Licenciamento',
    hi: 'व्यवसाय और लाइसेंसिंग पूछताछ',
  },
  businessDesc: {
    en: 'Interested in bringing Solocorn to your organization? We offer enterprise-grade licensing and custom integration services.',
    'zh-CN': '有兴趣将 Solocorn 引入您的组织？我们提供企业级许可和定制集成服务。',
    'zh-HK': '有興趣將 Solocorn 引入你嘅組織？我哋提供企業級許可同定制集成服務。',
    es: '¿Interesado en llevar Solocorn a su organización? Ofrecemos licencias de nivel empresarial y servicios de integración personalizados.',
    fr: "Intéressé à apporter Solocorn à votre organisation? Nous proposons des licences de niveau entreprise et des services d'intégration personnalisés.",
    de: 'Interessiert, Solocorn in Ihre Organisation zu bringen? Wir bieten Enterprise-Lizenzen und maßgeschneiderte Integrationsdienste an.',
    ja: 'Solocorn を貴社に導入することにご興味がありますか？エンタープライズグレードのライセンスとカスタム統合サービスを提供しています。',
    ko: 'Solocorn을 귀하의 조직에 도입하는 데 관심이 있으신가요? 엔터프라이즈급 라이선스 및 맞춤형 통합 서비스를 제공합니다.',
    pt: 'Interessado em trazer o Solocorn para sua organização? Oferecemos licenciamento corporativo e serviços de integração personalizados.',
    hi: 'अपने संगठन में Solocorn लाने में रुचि रखते हैं? हम एंटरप्राइज-ग्रेड लाइसेंसिंग और कस्टम एकीकरण सेवाएं प्रदान करते हैं।',
  },
  contact: {
    en: 'Contact',
    'zh-CN': '联系',
    'zh-HK': '聯繫',
    es: 'Contactar',
    fr: 'Contacter',
    de: 'Kontakt',
    ja: 'お問い合わせ',
    ko: '문의',
    pt: 'Contato',
    hi: 'संपर्क',
  },

  // Footer
  footerBrand: {
    en: 'Solocorn LLC',
    'zh-CN': 'Solocorn LLC',
    'zh-HK': 'Solocorn LLC',
    es: 'Solocorn LLC',
    fr: 'Solocorn LLC',
    de: 'Solocorn LLC',
    ja: 'Solocorn LLC',
    ko: 'Solocorn LLC',
    pt: 'Solocorn LLC',
    hi: 'Solocorn LLC',
  },
  privacyPolicy: {
    en: 'Privacy Policy',
    'zh-CN': '隐私政策',
    'zh-HK': '隱私政策',
    es: 'Política de privacidad',
    fr: 'Politique de confidentialité',
    de: 'Datenschutzrichtlinie',
    ja: 'プライバシーポリシー',
    ko: '개인정보 처리방침',
    pt: 'Política de Privacidade',
    hi: 'गोपनीयता नीति',
  },
  termsOfService: {
    en: 'Terms of Service',
    'zh-CN': '服务条款',
    'zh-HK': '服務條款',
    es: 'Términos de servicio',
    fr: "Conditions d'utilisation",
    de: 'Nutzungsbedingungen',
    ja: '利用規約',
    ko: '서비스 약관',
    pt: 'Termos de Serviço',
    hi: 'सेवा की शर्तें',
  },
  allRightsReserved: {
    en: '© 2026 Solocorn LLC. All rights reserved.',
    'zh-CN': '© 2026 Solocorn LLC。保留所有权利。',
    'zh-HK': '© 2026 Solocorn LLC。保留所有權利。',
    es: '© 2026 Solocorn LLC. Todos los derechos reservados.',
    fr: '© 2026 Solocorn LLC. Tous droits réservés.',
    de: '© 2026 Solocorn LLC. Alle Rechte vorbehalten.',
    ja: '© 2026 Solocorn LLC. All rights reserved.',
    ko: '© 2026 Solocorn LLC. 모든 권리 보유.',
    pt: '© 2026 Solocorn LLC. Todos os direitos reservados.',
    hi: '© 2026 Solocorn LLC। सर्वाधिकार सुरक्षित।',
  },

  // Modal Content
  beFirst: {
    en: 'Be the first to experience Solocorn',
    'zh-CN': '成为首批体验 Solocorn 的用户',
    'zh-HK': '成為首批體驗 Solocorn 嘅用戶',
    es: 'Sé el primero en experimentar Solocorn',
    fr: 'Soyez le premier à découvrir Solocorn',
    de: 'Seien Sie der Erste, der Solocorn erlebt',
    ja: 'Solocorn を最初に体験する',
    ko: 'Solocorn을 가장 먼저 경험하세요',
    pt: 'Seja o primeiro a experimentar o Solocorn',
    hi: 'Solocorn का अनुभव करने वाले पहले व्यक्ति बनें',
  },
  modalDescRegister: {
    en: "We're putting the finishing touches on our platform. Leave your details and we'll notify you when we launch.",
    'zh-CN': '我们正在为平台做最后的润色。留下您的详细信息，我们将在启动时通知您。',
    'zh-HK': '我哋正喺為平台做最後嘅潤色。留下你嘅詳細資料，我哋將喺啟動時通知你。',
    es: 'Estamos dando los toques finales a nuestra plataforma. Deje sus datos y le notificaremos cuando lancemos.',
    fr: 'Nous apportons la touche finale à notre plateforme. Laissez vos coordonnées et nous vous notifierons au lancement.',
    de: 'Wir geben unserer Plattform den letzten Schliff. Hinterlassen Sie Ihre Daten und wir benachrichtigen Sie beim Start.',
    ja: 'プラットフォームに最後の仕上げをしています。詳細を残していただければ、ローンチ時にお知らせします。',
    ko: '플랫폼에 마지막 터치를 하고 있습니다. 세부 정보를 남겨주시면 출시 시 알려드리겠습니다.',
    pt: 'Estamos dando os toques finais em nossa plataforma. Deixe seus dados e notificaremos você quando lançarmos.',
    hi: 'हम अपने प्लेटफॉर्म पर अंतिम रूप दे रहे हैं। अपनी जानकारी छोड़ें और हम लॉन्च होने पर आपको सूचित करेंगे।',
  },
  notifyMe: {
    en: 'Notify Me',
    'zh-CN': '通知我',
    'zh-HK': '通知我',
    es: 'Notificarme',
    fr: 'Me notifier',
    de: 'Benachrichtige mich',
    ja: '通知する',
    ko: '알림 받기',
    pt: 'Notifique-me',
    hi: 'मुझे सूचित करें',
  },
  thankYou: {
    en: 'Thank You!',
    'zh-CN': '谢谢您！',
    'zh-HK': '多謝你！',
    es: '¡Gracias!',
    fr: 'Merci !',
    de: 'Danke!',
    ja: 'ありがとうございます！',
    ko: '감사합니다!',
    pt: 'Obrigado!',
    hi: 'धन्यवाद!',
  },
  successMessageRegister: {
    en: "You're on the list! We'll be in touch soon.",
    'zh-CN': '您已在名单中！我们很快会与您联系。',
    'zh-HK': '你已喺名單入面！我哋好快會同你聯繫。',
    es: '¡Estás en la lista! Nos pondremos en contacto pronto.',
    fr: 'Vous êtes sur la liste ! Nous vous contacterons bientôt.',
    de: 'Sie sind auf der Liste! Wir werden uns bald melden.',
    ja: 'リストに登録されました！まもなくご連絡いたします。',
    ko: '명단에 올랐습니다! 곧 연락드리겠습니다.',
    pt: 'Você está na lista! Entraremos em contato em breve.',
    hi: 'आप सूची में हैं! हम जल्द ही संपर्क करेंगे।',
  },
  close: {
    en: 'Close',
    'zh-CN': '关闭',
    'zh-HK': '閂閉',
    es: 'Cerrar',
    fr: 'Fermer',
    de: 'Schließen',
    ja: '閉じる',
    ko: '닫기',
    pt: 'Fechar',
    hi: 'बंद करें',
  },
  yourName: {
    en: 'Your name',
    'zh-CN': '您的姓名',
    'zh-HK': '你嘅姓名',
    es: 'Su nombre',
    fr: 'Votre nom',
    de: 'Ihr Name',
    ja: 'お名前',
    ko: '이름',
    pt: 'Seu nome',
    hi: 'आपका नाम',
  },
  emailAddress: {
    en: 'Email address',
    'zh-CN': '电子邮件地址',
    'zh-HK': '電郵地址',
    es: 'Dirección de correo electrónico',
    fr: 'Adresse e-mail',
    de: 'E-Mail-Adresse',
    ja: 'メールアドレス',
    ko: '이메일 주소',
    pt: 'Endereço de e-mail',
    hi: 'ईमेल पता',
  },
  privacyNote: {
    en: 'We respect your privacy. Unsubscribe anytime.',
    'zh-CN': '我们尊重您的隐私。随时可以取消订阅。',
    'zh-HK': '我哋尊重你嘅隱私。隨時可以取消訂閱。',
    es: 'Respetamos su privacidad. Cancele la suscripción en cualquier momento.',
    fr: 'Nous respectons votre vie privée. Désabonnez-vous à tout moment.',
    de: 'Wir respektieren Ihre Privatsphäre. Jederzeit abbestellen.',
    ja: 'プライバシーを尊重します。いつでも購読を解除できます。',
    ko: '개인정보를 존중합니다. 언제든지 구독을 취소할 수 있습니다.',
    pt: 'Respeitamos sua privacidade. Cancele a inscrição a qualquer momento.',
    hi: 'हम आपकी गोपनीयता का सम्मान करते हैं। कभी भी अनसब्सक्राइब करें।',
  },
  joinWaitlist: {
    en: 'Join Waitlist',
    'zh-CN': '加入等待列表',
    'zh-HK': '加入等待列表',
    es: 'Unirse a la lista de espera',
    fr: "Rejoindre la liste d'attente",
    de: 'Warteliste beitreten',
    ja: 'ウェイトリストに参加',
    ko: '대기 목록 참여',
    pt: 'Entrar na Lista de Espera',
    hi: 'प्रतीक्षा सूची में शामिल हों',
  },
  expressInterest: {
    en: 'Express Interest',
    'zh-CN': '表达兴趣',
    'zh-HK': '表達興趣',
    es: 'Expresar interés',
    fr: 'Exprimer son intérêt',
    de: 'Interesse bekunden',
    ja: '興味を表明',
    ko: '관심 표현',
    pt: 'Expressar Interesse',
    hi: 'रुचि व्यक्त करें',
  },
  // Theme related
  selectTheme: {
    en: 'Select Theme',
    'zh-CN': '选择主题',
    'zh-HK': '選擇主題',
    es: 'Seleccionar tema',
    fr: 'Choisir le thème',
    de: 'Thema auswählen',
    ja: 'テーマを選択',
    ko: '테마 선택',
    pt: 'Selecionar Tema',
    hi: 'थीम चुनें',
  },
  lightMode: {
    en: 'Light',
    'zh-CN': '浅色',
    'zh-HK': '淺色',
    es: 'Claro',
    fr: 'Clair',
    de: 'Hell',
    ja: 'ライト',
    ko: '라이트',
    pt: 'Claro',
    hi: 'लाइट',
  },
  darkMode: {
    en: 'Dark',
    'zh-CN': '深色',
    'zh-HK': '深色',
    es: 'Oscuro',
    fr: 'Sombre',
    de: 'Dunkel',
    ja: 'ダーク',
    ko: '다크',
    pt: 'Escuro',
    hi: 'डार्क',
  },
  browseCategories: {
    en: 'Search for a Tutor or Course by Category',
    'zh-CN': '浏览类别',
    'zh-HK': '瀏覽類別',
    es: 'Explorar categorías',
    fr: 'Parcourir les catégories',
    de: 'Kategorien durchsuchen',
    ja: 'カテゴリーを閲覧',
    ko: '카테고리 탐색',
    pt: 'Navegar categorias',
    hi: 'श्रेणियाँ देखें',
  },
  selectCategoryPrompt: {
    en: 'Select a category to search for courses and tutors',
    'zh-CN': '选择一个类别来搜索课程和导师',
    'zh-HK': '選擇一個類別來搜尋課程和導師',
    es: 'Selecciona una categoría para buscar cursos y tutores',
    fr: 'Sélectionnez une catégorie pour rechercher des cours et des tuteurs',
    de: 'Wählen Sie eine Kategorie, um Kurse und Tutoren zu suchen',
    ja: 'カテゴリーを選択してコースとチューターを検索',
    ko: '코스 및 튜터를 검색할 카테고리 선택',
    pt: 'Selecione uma categoria para buscar cursos e tutores',
    hi: 'कोर्स और ट्यूटर खोजने के लिए एक श्रेणी चुनें',
  },
  selectCategoryBadgePlaceholder: {
    en: 'Select a category below',
    'zh-CN': '在下方选择一个类别',
    'zh-HK': '在下方選擇一個類別',
    es: 'Selecciona una categoría abajo',
    fr: 'Sélectionnez une catégorie ci-dessous',
    de: 'Wählen Sie eine Kategorie unten',
    ja: '下のカテゴリーを選択',
    ko: '아래에서 카테고리 선택',
    pt: 'Selecione uma categoria abaixo',
    hi: 'नीचे एक श्रेणी चुनें',
  },
  allRegions: {
    en: 'Region',
    'zh-CN': '所有地区',
    'zh-HK': '所有地區',
    es: 'Todas las regiones',
    fr: 'Toutes les régions',
    de: 'Alle Regionen',
    ja: 'すべての地域',
    ko: '모든 지역',
    pt: 'Todas as regiões',
    hi: 'सभी क्षेत्र',
  },
  allCountries: {
    en: 'Country',
    'zh-CN': '所有国家',
    'zh-HK': '所有國家',
    es: 'Todos los países',
    fr: 'Tous les pays',
    de: 'Alle Länder',
    ja: 'すべての国',
    ko: '모든 국가',
    pt: 'Todos os países',
    hi: 'सभी देश',
  },
  searchCategories: {
    en: 'Search categories...',
    'zh-CN': '搜索类别...',
    'zh-HK': '搜尋類別...',
    es: 'Buscar categorías...',
    fr: 'Rechercher des catégories...',
    de: 'Kategorien durchsuchen...',
    ja: 'カテゴリーを検索...',
    ko: '카테고리 검색...',
    pt: 'Pesquisar categorias...',
    hi: 'श्रेणियाँ खोजें...',
  },
  noCategoriesAvailable: {
    en: 'No categories available.',
    'zh-CN': '没有可用的类别。',
    'zh-HK': '沒有可用的類別。',
    es: 'No hay categorías disponibles.',
    fr: 'Aucune catégorie disponible.',
    de: 'Keine Kategorien verfügbar.',
    ja: '利用可能なカテゴリーはありません。',
    ko: '사용 가능한 카테고리가 없습니다.',
    pt: 'Nenhuma categoria disponível.',
    hi: 'कोई श्रेणी उपलब्ध नहीं है।',
  },
  selectRegionCountryNational: {
    en: 'Select a region or country to see national exams.',
    'zh-CN': '选择地区或国家以查看国家考试。',
    'zh-HK': '選擇地區或國家以查看國家考試。',
    es: 'Selecciona una región o país para ver exámenes nacionales.',
    fr: 'Sélectionnez une région ou un pays pour voir les examens nationaux.',
    de: 'Wählen Sie eine Region oder ein Land, um nationale Prüfungen zu sehen.',
    ja: '地域または国を選択して国家試験を表示します。',
    ko: '국가 시험을 볼 지역이나 국가를 선택하세요.',
    pt: 'Selecione uma região ou país para ver exames nacionais.',
    hi: 'राष्ट्रीय परीक्षाएँ देखने के लिए क्षेत्र या देश चुनें।',
  },
  selectRegionCountryUniversities: {
    en: 'Select a region or country to see universities.',
    'zh-CN': '选择地区或国家以查看大学。',
    'zh-HK': '選擇地區或國家以查看大學。',
    es: 'Selecciona una región o país para ver universidades.',
    fr: 'Sélectionnez une région ou un pays pour voir les universités.',
    de: 'Wählen Sie eine Region oder ein Land, um Universitäten zu sehen.',
    ja: '地域または国を選択して大学を表示します。',
    ko: '대학을 볼 지역이나 국가를 선택하세요.',
    pt: 'Selecione uma região ou país para ver universidades.',
    hi: 'विश्वविद्यालय देखने के लिए क्षेत्र या देश चुनें।',
  },
}

// --- Mock Data ---
const CELEBRITY_TUTORS = [
  {
    name: 'Dr. Aris',
    subject: 'Quantum Physics',
    image: 'https://picsum.photos/seed/tutor1/400/400',
  },
  {
    name: 'Sarah Jenkins',
    subject: 'Creative Writing',
    image: 'https://picsum.photos/seed/tutor2/400/400',
  },
  {
    name: 'Chef Marco',
    subject: 'Culinary Arts',
    image: 'https://picsum.photos/seed/tutor3/400/400',
  },
  {
    name: 'Elena Rossi',
    subject: 'Digital Marketing',
    image: 'https://picsum.photos/seed/tutor4/400/400',
  },
  { name: 'Prof. Zhang', subject: 'Mandarin', image: 'https://picsum.photos/seed/tutor5/400/400' },
  {
    name: 'David Miller',
    subject: 'Financial Literacy',
    image: 'https://picsum.photos/seed/tutor6/400/400',
  },
]

const SPECIAL_CODES = ['kim.kon#26', 'stephen#26']

const LANGUAGES: { code: Language; name: string; flag: string }[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'zh-CN', name: '简体中文 (Mandarin)', flag: '🇨🇳' },
  { code: 'zh-HK', name: '繁體中文 (Cantonese)', flag: '🇭🇰' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
]

// --- Investor Chat System Prompt ---
const INVESTOR_CHAT_PROMPT = `You are the Solocorn AI Assistant, an intelligent representative of Solocorn, a live AI-assisted tutoring platform. Use the following knowledge base to answer questions accurately.

## WHAT SOLOCORN IS
Solocorn is a live AI-assisted tutoring platform designed to allow a single tutor to teach large groups of students simultaneously while still delivering individualized feedback.

Traditional tutoring platforms scale poorly because tutors must manually grade student work and provide feedback. Solocorn solves this by using AI to automatically analyze student submissions and generate structured feedback immediately after each task.

This allows tutors to focus on teaching while the system handles grading, analysis, and feedback.

## THE CORE CONCEPT: LIVE TEACHING + AI EVALUATION
Solocorn is based on a simple division of labor.

Tutor responsibilities:
• Teach the lesson
• Decide what students should learn
• Create tasks or questions
• Guide the class discussion

AI responsibilities:
• Evaluate student answers
• Score responses instantly
• Identify mistakes and patterns
• Generate feedback for each student

This separation makes the system easier to use than fully automated AI learning platforms. Tutors remain in control of the learning process.

## HOW A SOLOCORN CLASS WORKS
A Solocorn class follows a repeating cycle:

Step 1 — Tutor Instruction: The tutor explains a concept just like in a normal class.
Step 2 — Tutor Assigns a Task: The tutor asks students to complete a short task or answer a question.
Step 3 — Students Submit Work: Students submit their answers through the platform.
Step 4 — AI Evaluation: The AI analyzes each student's response.
Step 5 — Immediate Feedback: Students receive personalized feedback within seconds.
Step 6 — Tutor Adjusts Teaching: The tutor can view class performance and adjust instruction accordingly.

This system is called PCI — Post-Completion Instruction.

## WHAT PCI (POST-COMPLETION INSTRUCTION) MEANS
PCI stands for Post-Completion Instruction. It refers to the process of giving students feedback immediately after they complete a learning task. Traditional classrooms often delay feedback until homework is graded later. Solocorn provides feedback instantly.

## KEY PLATFORM FEATURES
• Live Interactive Classrooms: Tutors can teach live classes with many students simultaneously
• AI-Assisted Evaluation: AI analyzes student responses in real time
• Micro-Task Learning Structure: Lessons are broken into short tasks
• Immediate Feedback: Students receive feedback within seconds
• Tutor Control: Tutors design lessons and tasks

## WHO SOLOCORN IS FOR
• Tutors: Can teach many students at once instead of one-to-one sessions
• Academies: Can use Solocorn to deliver classes to large groups of students
• Schools: Can use Solocorn as a digital classroom system with AI-assisted grading
• Students: Receive immediate feedback and more practice opportunities
• Investors: Solocorn addresses a key inefficiency in tutoring

## BUSINESS MODEL
Revenue sources include:
• Platform Commission: Solocorn takes a percentage of tutoring revenue
• Tutor Subscription: Tutors may pay a monthly fee to access platform tools
• Institutional Licensing: Schools and academies can license the platform

## COMPETITIVE POSITION
Traditional tutoring platform: 1 tutor → 1 student, manual grading, limited scalability
Solocorn: 1 tutor → many students, AI grading and feedback, scalable instruction

Unlike AI learning apps that replace teachers, Solocorn keeps tutors in control of instruction while AI handles grading and feedback.

## SUBJECTS SUPPORTED
IELTS, TOEFL, SAT, AP courses, A-Level, mathematics, science subjects, English language learning, university entrance exams.

## STRATEGIC ADVANTAGE
The tutoring industry historically scales in only two ways: hire more tutors or raise prices. Solocorn proposes a third possibility: increase tutor capacity through AI-assisted evaluation.

## RESPONSE GUIDELINES
- Be professional, knowledgeable, and helpful
- Answer based on the knowledge base provided
- If asked about specific investment details, direct to the contact form
- Keep responses concise but informative
- If unsure, say "Let me connect you with our team for detailed information"
- Never make up specific financial data or projections`

// --- Background Animation Components ---

const GridFloor = ({ theme }: { theme: ColorTheme }) => {
  const gridColors = {
    emerald: 'rgba(16, 185, 129, 0.2)',
    ocean: 'rgba(14, 165, 233, 0.2)',
    sunset: 'rgba(245, 158, 11, 0.2)',
    galaxy: 'rgba(168, 85, 247, 0.2)',
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute bottom-0 left-0 right-0 h-2/3 origin-bottom"
        style={{ transform: 'perspective(500px) rotateX(60deg)' }}
      >
        <motion.div
          className="h-[200%] w-full"
          style={{
            backgroundImage: `linear-gradient(to right, ${gridColors[theme]} 1px, transparent 1px), linear-gradient(to bottom, ${gridColors[theme]} 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
          animate={{ y: ['0%', '60px'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    </div>
  )
}

const FloatingSymbol = ({
  symbol,
  x,
  y,
  delay,
  theme,
}: {
  symbol: string
  x: string
  y: string
  delay: number
  theme: ColorTheme
}) => {
  const colors = {
    emerald: 'text-emerald-400/30',
    ocean: 'text-sky-400/30',
    sunset: 'text-amber-400/30',
    galaxy: 'text-purple-400/30',
  }

  return (
    <motion.div
      className={`absolute font-bold ${colors[theme]} pointer-events-none select-none`}
      style={{ left: x, top: y, fontSize: '3rem', textShadow: '0 0 20px currentColor' }}
      animate={{ y: [-15, 15, -15], opacity: [0.3, 0.6, 0.3], rotate: [0, 5, -5, 0] }}
      transition={{ duration: 4, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      {symbol}
    </motion.div>
  )
}

const FloatingText = ({
  text,
  x,
  y,
  delay,
  theme,
}: {
  text: string
  x: string
  y: string
  delay: number
  theme: ColorTheme
}) => {
  const colors = {
    emerald: 'text-emerald-400/20',
    ocean: 'text-sky-400/20',
    sunset: 'text-amber-400/20',
    galaxy: 'text-purple-400/20',
  }

  return (
    <motion.div
      className={`absolute font-bold tracking-wider ${colors[theme]} pointer-events-none select-none uppercase`}
      style={{ left: x, top: y, fontSize: '1.5rem', textShadow: '0 0 10px currentColor' }}
      animate={{ y: [-10, 10, -10], opacity: [0.15, 0.35, 0.15] }}
      transition={{ duration: 5, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      {text}
    </motion.div>
  )
}

const FloatingShape = ({
  Icon,
  x,
  y,
  delay,
  theme,
}: {
  Icon: any
  x: string
  y: string
  delay: number
  theme: ColorTheme
}) => {
  const colors = {
    emerald: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400/50',
      shadow: 'shadow-emerald-500/20',
    },
    ocean: {
      border: 'border-sky-500/30',
      bg: 'bg-sky-500/10',
      text: 'text-sky-400/50',
      shadow: 'shadow-sky-500/20',
    },
    sunset: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400/50',
      shadow: 'shadow-amber-500/20',
    },
    galaxy: {
      border: 'border-purple-500/30',
      bg: 'bg-purple-500/10',
      text: 'text-purple-400/50',
      shadow: 'shadow-purple-500/20',
    },
  }

  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left: x, top: y }}
      animate={{ y: [-20, 20, -20], rotate: [0, 360] }}
      transition={{ duration: 12, delay, repeat: Infinity, ease: 'linear' }}
    >
      <div
        className={`h-12 w-12 border-2 ${colors[theme].border} ${colors[theme].bg} rounded-lg shadow-lg backdrop-blur-sm ${colors[theme].shadow} flex items-center justify-center`}
      >
        <Icon className={`h-6 w-6 ${colors[theme].text}`} />
      </div>
    </motion.div>
  )
}

const AtomOrbit = ({
  x,
  y,
  size,
  duration,
  theme,
}: {
  x: string
  y: string
  size: number
  duration: number
  theme: ColorTheme
}) => {
  const colors = {
    emerald: {
      nucleus: 'bg-emerald-400',
      shadow: 'shadow-emerald-500/50',
      ring: 'border-emerald-500/20',
      electron: 'bg-blue-400',
      electronShadow: 'shadow-blue-500/50',
    },
    ocean: {
      nucleus: 'bg-sky-400',
      shadow: 'shadow-sky-500/50',
      ring: 'border-sky-500/20',
      electron: 'bg-indigo-400',
      electronShadow: 'shadow-indigo-500/50',
    },
    sunset: {
      nucleus: 'bg-amber-400',
      shadow: 'shadow-amber-500/50',
      ring: 'border-amber-500/20',
      electron: 'bg-rose-400',
      electronShadow: 'shadow-rose-500/50',
    },
    galaxy: {
      nucleus: 'bg-purple-400',
      shadow: 'shadow-purple-500/50',
      ring: 'border-purple-500/20',
      electron: 'bg-pink-400',
      electronShadow: 'shadow-pink-500/50',
    },
  }

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      <div
        className={`absolute h-2 w-2 ${colors[theme].nucleus} rounded-full shadow-lg ${colors[theme].shadow} left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2`}
      />
      <motion.div
        className={`absolute border ${colors[theme].ring} rounded-full`}
        style={{ width: size, height: size, left: -size / 2, top: -size / 2 }}
        animate={{ rotate: 360 }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
      >
        <div
          className={`absolute h-1.5 w-1.5 ${colors[theme].electron} rounded-full shadow-lg ${colors[theme].electronShadow} -top-0.5 left-1/2 -translate-x-1/2`}
        />
      </motion.div>
    </div>
  )
}

const GlowingOrb = ({
  x,
  y,
  color,
  size,
  delay,
}: {
  x: string
  y: string
  color: string
  size: string
  delay: number
}) => (
  <motion.div
    className={`pointer-events-none absolute rounded-full blur-3xl ${color}`}
    style={{ left: x, top: y, width: size, height: size }}
    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
    transition={{ duration: 4, delay, repeat: Infinity, ease: 'easeInOut' }}
  />
)

const ShootingStar = ({ delay, top, theme }: { delay: number; top: string; theme: ColorTheme }) => {
  const colors = {
    emerald: 'via-emerald-400',
    ocean: 'via-sky-400',
    sunset: 'via-amber-400',
    galaxy: 'via-purple-400',
  }

  return (
    <motion.div
      className={`absolute h-px bg-gradient-to-r from-transparent ${colors[theme]} pointer-events-none to-transparent`}
      style={{ width: '100px', top, left: '-100px' }}
      animate={{ left: ['-10%', '110%'], opacity: [0, 1, 0] }}
      transition={{ duration: 1.5, delay, repeat: Infinity, repeatDelay: 5, ease: 'easeOut' }}
    />
  )
}

const FuturisticBackground = ({ theme, mode }: { theme: ColorTheme; mode: ThemeMode }) => {
  const bgColors = {
    emerald:
      mode === 'dark'
        ? 'from-slate-950 via-zinc-950 to-slate-900'
        : 'from-emerald-50 via-white to-emerald-100',
    ocean:
      mode === 'dark'
        ? 'from-slate-950 via-blue-950 to-slate-900'
        : 'from-sky-50 via-white to-blue-100',
    sunset:
      mode === 'dark'
        ? 'from-orange-950 via-red-950 to-slate-900'
        : 'from-orange-50 via-white to-amber-100',
    galaxy:
      mode === 'dark'
        ? 'from-purple-950 via-fuchsia-950 to-slate-900'
        : 'from-purple-50 via-white to-fuchsia-100',
  }

  const orbColors = {
    emerald:
      mode === 'dark'
        ? ['bg-emerald-500/20', 'bg-blue-500/20', 'bg-purple-500/10']
        : ['bg-emerald-400/30', 'bg-blue-400/30', 'bg-purple-400/20'],
    ocean:
      mode === 'dark'
        ? ['bg-sky-500/20', 'bg-indigo-500/20', 'bg-blue-500/10']
        : ['bg-sky-400/30', 'bg-indigo-400/30', 'bg-blue-400/20'],
    sunset:
      mode === 'dark'
        ? ['bg-amber-500/20', 'bg-rose-500/20', 'bg-orange-500/10']
        : ['bg-amber-400/30', 'bg-rose-400/30', 'bg-orange-400/20'],
    galaxy:
      mode === 'dark'
        ? ['bg-purple-500/20', 'bg-pink-500/20', 'bg-fuchsia-500/10']
        : ['bg-purple-400/30', 'bg-pink-400/30', 'bg-fuchsia-400/20'],
  }

  return (
    <div className={`fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br ${bgColors[theme]}`}>
      <GridFloor theme={theme} />
      <FloatingSymbol symbol="∑" x="10%" y="20%" delay={0} theme={theme} />
      <FloatingSymbol symbol="π" x="85%" y="15%" delay={1} theme={theme} />
      <FloatingSymbol symbol="∫" x="75%" y="70%" delay={2} theme={theme} />
      <FloatingSymbol symbol="√" x="15%" y="75%" delay={0.5} theme={theme} />
      <FloatingSymbol symbol="∞" x="50%" y="10%" delay={1.5} theme={theme} />
      <FloatingSymbol symbol="∆" x="90%" y="50%" delay={2.5} theme={theme} />
      <FloatingSymbol symbol="Ω" x="5%" y="50%" delay={3} theme={theme} />
      <FloatingSymbol symbol="λ" x="60%" y="80%" delay={0.8} theme={theme} />
      {/* Exam names floating in background */}
      <FloatingText text="IELTS" x="12%" y="35%" delay={0} theme={theme} />
      <FloatingText text="TOEFL" x="88%" y="25%" delay={0.5} theme={theme} />
      <FloatingText text="AP" x="25%" y="15%" delay={1} theme={theme} />
      <FloatingText text="IB" x="72%" y="85%" delay={1.5} theme={theme} />
      <FloatingText text="SAT" x="8%" y="65%" delay={2} theme={theme} />
      <FloatingText text="LSAT" x="82%" y="45%" delay={2.5} theme={theme} />
      <FloatingText text="A LEVEL" x="35%" y="90%" delay={3} theme={theme} />
      <FloatingText text="GRE" x="65%" y="5%" delay={3.5} theme={theme} />
      <FloatingText text="GMAT" x="45%" y="55%" delay={4} theme={theme} />
      <FloatingText text="ACT" x="18%" y="50%" delay={4.5} theme={theme} />
      <FloatingText text="MCAT" x="78%" y="75%" delay={0.3} theme={theme} />
      <FloatingText text="GCSE" x="5%" y="85%" delay={0.8} theme={theme} />
      <FloatingShape Icon={Square} x="20%" y="30%" delay={0} theme={theme} />
      <FloatingShape Icon={Circle} x="70%" y="25%" delay={2} theme={theme} />
      <FloatingShape Icon={Triangle} x="80%" y="60%" delay={4} theme={theme} />
      <FloatingShape Icon={Hexagon} x="25%" y="65%" delay={1} theme={theme} />
      <FloatingShape Icon={Atom} x="50%" y="40%" delay={3} theme={theme} />
      <AtomOrbit x="30%" y="35%" size={120} duration={10} theme={theme} />
      <AtomOrbit x="70%" y="55%" size={150} duration={14} theme={theme} />
      <AtomOrbit x="45%" y="75%" size={100} duration={8} theme={theme} />
      <GlowingOrb x="20%" y="20%" color={orbColors[theme][0]} size="300px" delay={0} />
      <GlowingOrb x="70%" y="60%" color={orbColors[theme][1]} size="250px" delay={1} />
      <GlowingOrb x="40%" y="40%" color={orbColors[theme][2]} size="400px" delay={2} />
      <ShootingStar delay={0} top="15%" theme={theme} />
      <ShootingStar delay={3} top="35%" theme={theme} />
      <ShootingStar delay={6} top="55%" theme={theme} />
    </div>
  )
}

// --- Category Grid Icon (3×3 colorful squares with pulse + color wave) ---
const CategoryGridIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{
      pointerEvents: 'none',
      animation: 'cat-pulse 2s ease-in-out 0s infinite',
      transformOrigin: 'center',
    }}
  >
    <style>{`
      @keyframes cat-pulse {
        0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 transparent); }
        50% { transform: scale(1.25); filter: drop-shadow(0 0 8px rgba(255,255,255,0.6)); }
      }
      @keyframes cat-brighten {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; filter: brightness(1.6); }
      }
    `}</style>
    {/* Row 1 */}
    <rect x="1" y="1" width="6" height="6" rx="1.5" fill="#F5C542" style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.0s' }} />
    <rect x="9" y="1" width="6" height="6" rx="1.5" fill="#E63946" style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.1s' }} />
    <rect x="17" y="1" width="6" height="6" rx="1.5" fill="#9B5DE5" style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.2s' }} />
    {/* Row 2 */}
    <rect x="1" y="9" width="6" height="6" rx="1.5" fill="#52B788" style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.3s' }} />
    <rect x="9" y="9" width="6" height="6" rx="1.5" fill="#48CAE4" style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.4s' }} />
    <rect x="17" y="9" width="6" height="6" rx="1.5" fill="#F4A261" style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.5s' }} />
    {/* Row 3 */}
    <rect x="1" y="17" width="6" height="6" rx="1.5" fill="#E83F6F" style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.6s' }} />
    <rect x="9" y="17" width="6" height="6" rx="1.5" fill="#0D9488" style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.7s' }} />
    <rect x="17" y="17" width="6" height="6" rx="1.5" fill="#64748B" style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.8s' }} />
  </svg>
)

// --- Other Components ---

const LanguageSelector = ({
  currentLang,
  onChange,
  theme,
}: {
  currentLang: Language
  onChange: (lang: Language) => void
  theme: ColorTheme
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const currentLangData = LANGUAGES.find(l => l.code === currentLang)

  const themeColors = {
    emerald: 'hover:bg-emerald-500/10 text-emerald-400',
    ocean: 'hover:bg-sky-500/10 text-sky-400',
    sunset: 'hover:bg-amber-500/10 text-amber-400',
    galaxy: 'hover:bg-purple-500/10 text-purple-400',
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors hover:bg-white/10"
      >
        <Globe className="h-4 w-4" />
        <span>{currentLangData?.flag}</span>
        <span className="hidden sm:inline">{currentLangData?.name}</span>
        <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence mode="wait">
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl"
            >
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => {
                    onChange(lang.code)
                    setIsOpen(false)
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 ${currentLang === lang.code ? `${themeColors[theme]} bg-opacity-10` : 'text-white'}`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-sm">{lang.name}</span>
                  {currentLang === lang.code && <CheckCircle className="ml-auto h-4 w-4" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

const CountdownTimer = () => {
  const [timeLeft, setTimeLeft] = useState({ days: 14, hours: 5, minutes: 40, seconds: 1 })
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        let { days, hours, minutes, seconds } = prev
        seconds -= 1
        if (seconds < 0) {
          seconds = 59
          minutes -= 1
        }
        if (minutes < 0) {
          minutes = 59
          hours -= 1
        }
        if (hours < 0) {
          hours = 23
          days -= 1
        }
        if (days < 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
        return { days, hours, minutes, seconds }
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  const units = [
    { value: timeLeft.days, label: 'DAYS' },
    { value: timeLeft.hours, label: 'HOURS' },
    { value: timeLeft.minutes, label: 'MINUTES' },
    { value: timeLeft.seconds, label: 'SECONDS' },
  ]
  return (
    <div className="font-display flex items-start justify-center gap-2 md:gap-3">
      {units.map((unit, i) => (
        <React.Fragment key={unit.label}>
          <div className="flex flex-col items-center">
            <div className="text-3xl font-bold tabular-nums leading-none text-white md:text-4xl">
              {unit.value.toString().padStart(2, '0')}
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-white/60 md:text-[10px]">
              {unit.label}
            </div>
          </div>
          {i < units.length - 1 && (
            <div className="pt-0 text-3xl font-bold leading-none text-white/30 md:text-4xl">:</div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

const Panel2SearchResults = ({ query, onClearAll }: { query: string; onClearAll: () => void }) => {
  const q = query.trim()
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedCountryCode, setSelectedCountryCode] = useState('')
  const [courses, setCourses] = useState<any[]>([])
  const [tutors, setTutors] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const PAGE_SIZE = 5
  const [coursesPage, setCoursesPage] = useState(0)
  const [tutorsPage, setTutorsPage] = useState(0)
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null)
  const [rotation, setRotation] = useState(0)
  const router = useRouter()

  const hasFilters = q !== '' || selectedRegion !== '' || selectedCountryCode !== ''
  const showReset = selectedCountryCode !== ''

  useEffect(() => {
    if (showReset) {
      setRotation(r => r + 360)
    }
  }, [showReset])

  const availableCountries = (() => {
    const region = REGIONS.find(r => r.id === selectedRegion)
    return region ? region.countries : []
  })()

  useEffect(() => {
    const controller = new AbortController()
    let finished = false

    // Fallback: force loading state to false after 5s no matter what
    const fallbackTimer = setTimeout(() => {
      if (!finished) {
        console.warn('[Landing] Fallback timer fired — forcing isLoading=false')
        setIsLoading(false)
        setHasLoaded(true)
      }
    }, 5000)

    const fetchWithTimeout = (url: string, options: RequestInit, timeoutMs = 5000) =>
      Promise.race([
        fetch(url, options),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        ),
      ])

    const run = async () => {
      console.log('[Landing] Fetch starting...')
      setIsLoading(true)
      setLoadError(null)
      setCoursesPage(0)
      setTutorsPage(0)
      try {
        const params = new URLSearchParams()
        params.set('page', '1')
        params.set('pageSize', '24')
        if (q) params.set('q', q)
        if (selectedRegion !== 'global' && selectedCountryCode) {
          params.set('country', selectedCountryCode)
        }
        const qp = `?${params.toString()}`
        const [coursesRes, tutorsRes] = await Promise.all([
          fetchWithTimeout(`/api/public/courses${qp}`, {
            signal: controller.signal,
          }),
          fetchWithTimeout(`/api/public/tutors${qp}`, {
            signal: controller.signal,
          }),
        ])
        console.log('[Landing] Fetch completed:', { coursesOk: coursesRes.ok, tutorsOk: tutorsRes.ok })

        const parseJsonSafe = async (res: Response) => {
          const ct = res.headers.get('content-type') || ''
          if (!ct.includes('application/json')) return null
          return await res.json()
        }

        const [coursesJson, tutorsJson] = await Promise.all([
          coursesRes.ok ? parseJsonSafe(coursesRes) : null,
          tutorsRes.ok ? parseJsonSafe(tutorsRes) : null,
        ])
        console.log('[Landing] Parsed JSON:', { coursesCount: coursesJson?.courses?.length, tutorsCount: tutorsJson?.tutors?.length })

        if (!finished) {
          setCourses(Array.isArray(coursesJson?.courses) ? coursesJson.courses : [])
          setTutors(Array.isArray(tutorsJson?.tutors) ? tutorsJson.tutors : [])

          if (!coursesRes.ok && !tutorsRes.ok) {
            setLoadError('Unable to load results.')
          }
        }
      } catch (err: any) {
        console.error('[Landing] Fetch error:', err?.name, err?.message)
        if (!finished && err?.name !== 'AbortError') {
          setLoadError('Unable to load results.')
        }
      } finally {
        console.log('[Landing] Fetch finally — finished:', finished)
        if (!finished) {
          setIsLoading(false)
          setHasLoaded(true)
        }
        clearTimeout(fallbackTimer)
      }
    }

    const t = setTimeout(run, q ? 200 : 0)
    return () => {
      finished = true
      controller.abort()
      clearTimeout(t)
      clearTimeout(fallbackTimer)
    }
  }, [query, selectedCountryCode])

  const formatCourseDate = (iso: string | null | undefined) => {
    if (!iso) return 'Starts TBD'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return 'Starts TBD'
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `Starts ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear().toString().slice(-2)}`
  }

  const CourseSlot = ({ item }: { item: any }) => (
    <div
      role="button"
      tabIndex={0}
      className="block h-full w-full cursor-pointer outline-none"
      onClick={() => setSelectedCourse(item)}
      onKeyDown={e => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        setSelectedCourse(item)
      }}
    >
      <div
        className="h-[280px] w-[var(--card-width)] overflow-hidden rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(30,40,50,0.65)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_25px_rgba(0,0,0,0.30)] transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_14px_30px_rgba(0,0,0,0.40)] hover:brightness-105"
        style={{
          backgroundImage:
            'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(55, 65, 75, 0.85), rgba(25, 35, 45, 0.95))',
          transform: 'translateZ(0)',
        }}
      >
        <div className="flex h-full flex-col p-4" style={{ transform: 'translateZ(0)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm font-semibold text-slate-100">{item?.name}</div>
              <div className="mt-1 text-xs font-medium text-slate-300">
                @{item?.tutor?.username || 'tutor'}
              </div>
            </div>

            <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)] shadow-[0_8px_20px_rgba(0,0,0,0.28)]">
              {item?.tutor?.avatarUrl ? (
                <img
                  src={item.tutor.avatarUrl}
                  alt={item?.tutor?.name || item?.tutor?.username || 'Tutor'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[rgba(255,255,255,0.05)] text-slate-300">
                  <User className="h-7 w-7 opacity-50" />
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex-1 rounded-[14px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] px-3 py-2 min-h-0">
            <div className="line-clamp-6 text-[11px] leading-relaxed text-slate-200">
              {(item?.description || '').trim() || 'No course description provided yet.'}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-semibold">
            <div className="truncate text-slate-300">
              {item?.isFree ? 'Free' : item?.price != null ? `$${item.price}` : 'Free'}
            </div>
            <div className="text-blue-400">{formatCourseDate(item?.updatedAt)}</div>
          </div>
        </div>
      </div>
    </div>
  )

  const TutorSlot = ({ item }: { item: any }) => (
    <Link href={`/u/${encodeURIComponent(item?.username || '')}`} className="block h-full w-full">
      <div
        className="h-[clamp(220px,18vw,280px)] w-[var(--card-width)] overflow-hidden rounded-[22px] border border-[rgba(255,255,255,0.12)] bg-[rgba(30,40,50,0.65)] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_12px_30px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_14px_30px_rgba(0,0,0,0.40)] hover:brightness-105"
        style={{
          backgroundImage:
            'linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.00) 65%), linear-gradient(145deg, rgba(70, 110, 180, 0.75), rgba(25, 55, 110, 0.95))',
          transform: 'translateZ(0)',
        }}
      >
        <div className="flex h-full flex-col p-4" style={{ transform: 'translateZ(0)' }}>
          {/* Header: Name/Handle on left, large avatar on right */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-50">
                {item?.name || 'Tutor'}
              </div>
              <div className="mt-0.5 truncate text-xs font-medium text-slate-300">
                @{item?.username || 'tutor'}
              </div>
            </div>
            <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)] shadow-[0_8px_20px_rgba(0,0,0,0.28)]">
              {item?.avatarUrl ? (
                <img
                  src={item.avatarUrl}
                  alt={item?.name || 'Tutor'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[rgba(255,255,255,0.05)] text-slate-300">
                  <User className="h-7 w-7 opacity-50" />
                </div>
              )}
            </div>
          </div>

          {/* Bio — expands to fill available space */}
          <div className="mt-3 flex-1 min-h-0 rounded-[14px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] px-3 py-2">
            <div className="line-clamp-6 text-[11px] leading-relaxed text-slate-100">
              {(item?.bio || '').trim() || 'Experienced tutor ready to help you improve quickly.'}
            </div>
          </div>

          {/* Bottom row: courses (left) | country name (right) */}
          <div className="mt-3 flex items-center justify-between text-xs font-semibold">
            <div className="truncate text-slate-300">
              {typeof item?.courseCount === 'number' ? `${item.courseCount} courses` : ''}
            </div>
            {item?.country ? (
              <span className="truncate text-slate-200">{item.country}</span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  )

  const TriangleArrow = ({
    direction,
    disabled,
    onClick,
    label,
    kind,
    className,
  }: {
    direction: 'left' | 'right'
    disabled: boolean
    onClick: () => void
    label: string
    kind?: 'courses' | 'tutors'
    className?: string
  }) => {
    const isCourses = kind === 'courses'
    const bg = isCourses
      ? 'linear-gradient(135deg, rgba(55,65,75,0.5) 0%, rgba(25,35,45,0.5) 100%)'
      : 'linear-gradient(135deg, rgba(70,110,180,0.5) 0%, rgba(25,55,110,0.5) 100%)'
    const outline = isCourses
      ? 'drop-shadow(0 0 2px rgba(30,40,50,0.5)) drop-shadow(0 0 4px rgba(30,40,50,0.3))'
      : 'drop-shadow(0 0 2px rgba(25,55,110,0.5)) drop-shadow(0 0 4px rgba(25,55,110,0.3))'
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'shrink-0 transition-all duration-300',
          'h-[clamp(176px,14.4vw,224px)] w-[clamp(44px,3.6vw,56px)]',
          'self-center',
          !disabled
            ? cn(
                'cursor-pointer',
                'hover:brightness-110',
                'hover:-translate-y-[2px]',
                direction === 'left' && 'hover:-translate-x-1',
                direction === 'right' && 'hover:translate-x-1'
              )
            : 'cursor-not-allowed opacity-30 grayscale',
          className
        )}
        style={{
          clipPath:
            direction === 'left'
              ? 'polygon(100% 0, 100% 100%, 0 50%)'
              : 'polygon(0 0, 0 100%, 100% 50%)',
          background: bg,
          filter: `drop-shadow(0 12px 24px rgba(0,0,0,0.35)) ${outline}`,
        }}
        aria-label={label}
      />
    )
  }

  const CarouselRow = ({
    title,
    icon,
    items,
    kind,
    page,
    setPage,
  }: {
    title: string
    icon: React.ReactNode
    items: any[]
    kind: 'courses' | 'tutors'
    page: number
    setPage: (next: number) => void
  }) => (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
        <span className="text-slate-500">{icon}</span>
        <span>{title}</span>
      </div>
      {(() => {
        const totalPages = isLoading ? 1 : Math.max(1, Math.ceil(items.length / PAGE_SIZE))
        const currentPage = Math.min(Math.max(page, 0), totalPages - 1)
        const canPrev = !isLoading && currentPage > 0
        const canNext = !isLoading && currentPage < totalPages - 1
        const visible = isLoading
          ? Array.from({ length: PAGE_SIZE }).map((_, i) => ({
              __skeleton: true,
              id: `s-${kind}-${i}`,
            }))
          : items.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)
        const placeholders = Math.max(0, PAGE_SIZE - visible.length)

        return (
          <div
            className="flex w-full items-center justify-center gap-[18px]"
            style={{
              ['--card-width' as any]: '240px',
              ['--card-gap' as any]: '32px',
            }}
          >
            <TriangleArrow
              direction="left"
              disabled={!canPrev}
              onClick={() => setPage(Math.max(currentPage - 1, 0))}
              label="Previous"
              kind={kind}
            />

            <div className="w-[calc((var(--card-width)*5)+(var(--card-gap)*4))] overflow-visible py-3">
              <div className="grid grid-cols-5 gap-8">
                {visible.map((item: any, i: number) => (
                  <div key={item?.id || item?.__skeleton || i} className="w-[var(--card-width)]">
                    {item?.__skeleton ? (
                      <div className={cn(kind === 'courses' ? 'h-[280px]' : 'h-[clamp(220px,18vw,280px)]', 'w-[var(--card-width)] rounded-[22px] border border-dashed border-[rgba(255,255,255,0.20)] bg-[rgba(30,40,50,0.35)] shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_10px_25px_rgba(0,0,0,0.25)]')}>
                        <div className="flex h-full w-full items-center justify-center">
                          <div className="text-center">
                            <div className="mx-auto mb-2 h-8 w-8 animate-pulse rounded-full bg-white/10" />
                            <div className="text-[10px] font-medium text-white/30">Loading...</div>
                          </div>
                        </div>
                      </div>
                    ) : kind === 'courses' ? (
                      <CourseSlot item={item} />
                    ) : (
                      <TutorSlot item={item} />
                    )}
                  </div>
                ))}
                {Array.from({ length: placeholders }).map((_, i) => (
                  <div
                    key={`placeholder-${kind}-${currentPage}-${i}`}
                    className={cn(kind === 'courses' ? 'h-[280px]' : 'h-[clamp(220px,18vw,280px)]', 'w-[var(--card-width)]')}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>

            <TriangleArrow
              direction="right"
              disabled={!canNext}
              onClick={() => setPage(Math.min(currentPage + 1, totalPages - 1))}
              label="Next"
              kind={kind}
              className="mr-6"
            />
          </div>
        )
      })()}

    </div>
  )

  return (
    <section
      id="panel-2-search-results"
      className="relative w-full min-h-[600px] overflow-hidden"
      style={{
        backgroundColor: '#D7DCE2',
        backgroundImage:
          'linear-gradient(to right, rgba(255,255,255,0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.55) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
      }}
    >
      <div className="mx-auto w-full max-w-[1536px] px-8 py-10">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Select
            value={selectedRegion}
            onValueChange={value => {
              setSelectedRegion(value)
              setSelectedCountryCode('')
            }}
          >
            <SelectTrigger className="h-10 w-[212px] rounded-lg border border-slate-700/25 bg-white/30 text-slate-700 shadow-[0_4px_12px_rgba(0,0,0,0.15)] backdrop-blur-sm focus-visible:!shadow-none focus:outline-none focus-visible:outline-none transition-all duration-200 hover:-translate-y-[1px] hover:bg-white/60 hover:border-slate-700/50 hover:shadow-[0_6px_16px_rgba(0,0,0,0.20)] disabled:bg-slate-100/20 disabled:border-slate-400/20 disabled:text-slate-400 disabled:backdrop-blur-none disabled:hover:translate-y-0 disabled:hover:bg-slate-100/20 disabled:hover:border-slate-400/20 disabled:hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent className="rounded-lg border border-slate-700/25 bg-none bg-white/30 p-1.5 shadow-lg backdrop-blur-xl w-[var(--radix-select-trigger-width)]">
              {REGIONS.map(region => (
                <SelectItem key={region.id} value={region.id} className="text-slate-700 focus:text-slate-900 hover:bg-slate-100/50 focus:bg-slate-100/50 mx-1.5 focus:outline-none rounded-md">
                  {region.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedCountryCode}
            onValueChange={setSelectedCountryCode}
            disabled={!selectedRegion || selectedRegion === 'global'}
          >
            <SelectTrigger className="h-10 w-[212px] rounded-lg border border-slate-700/25 bg-white/30 text-slate-700 shadow-[0_4px_12px_rgba(0,0,0,0.15)] backdrop-blur-sm focus-visible:!shadow-none focus:outline-none focus-visible:outline-none transition-all duration-200 hover:-translate-y-[1px] hover:bg-white/60 hover:border-slate-700/50 hover:shadow-[0_6px_16px_rgba(0,0,0,0.20)] disabled:bg-slate-100/20 disabled:border-slate-400/20 disabled:text-slate-400 disabled:backdrop-blur-none disabled:hover:translate-y-0 disabled:hover:bg-slate-100/20 disabled:hover:border-slate-400/20 disabled:hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent className="rounded-lg border border-slate-700/25 bg-none bg-white/30 p-1.5 shadow-lg backdrop-blur-xl w-[var(--radix-select-trigger-width)]">
              {availableCountries.map(country => (
                <SelectItem key={country.code} value={country.code} className="text-slate-700 focus:text-slate-900 hover:bg-slate-100/50 focus:bg-slate-100/50 mx-1.5 focus:outline-none rounded-md">
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => {
              setSelectedCountryCode('')
            }}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/25 bg-white/30 text-slate-700 shadow-[0_4px_12px_rgba(0,0,0,0.15)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-[1px] hover:bg-white/60 hover:border-slate-700/50 hover:shadow-[0_6px_16px_rgba(0,0,0,0.20)] disabled:opacity-50",
              !showReset && "invisible opacity-0 pointer-events-none",
              showReset && "visible opacity-100"
            )}
            aria-label="Clear country filter"
          >
            <RefreshCw
              className="h-4 w-4 transition-transform duration-500 ease-out"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          </button>
        </div>

        <div className="mt-8 space-y-10">
          <CarouselRow
            title="Courses"
            icon={<BookOpen className="h-4 w-4" />}
            items={courses}
            kind="courses"
            page={coursesPage}
            setPage={setCoursesPage}
          />
          <CarouselRow
            title="Tutors"
            icon={<Users className="h-4 w-4" />}
            items={tutors}
            kind="tutors"
            page={tutorsPage}
            setPage={setTutorsPage}
          />
        </div>
      </div>

      {/* Course Detail Dialog — opens when a course card is clicked on the landing page */}
      <Dialog
        open={!!selectedCourse}
        onOpenChange={open => !open && setSelectedCourse(null)}
      >
        <DialogContent className="flex h-[80vh] w-[80vw] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-2xl">{selectedCourse?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-auto p-6 pt-0">
            <DialogPanel>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Category</div>
                  <div className="text-base font-semibold text-foreground">
                    {selectedCourse?.categories?.[0] || 'general'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Sessions</div>
                  <div className="text-base font-semibold text-foreground">
                    {selectedCourse?.lessonCount ?? 0} sessions
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Price</div>
                  <div className="text-base font-semibold text-foreground">
                    {selectedCourse?.isFree
                      ? 'Free'
                      : selectedCourse?.price != null
                        ? `$${selectedCourse.price}`
                        : 'Free'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Cost per Session</div>
                  <div className="text-base font-semibold text-foreground">
                    {selectedCourse?.isFree
                      ? 'Free'
                      : selectedCourse?.price != null && selectedCourse?.lessonCount
                        ? `$${(selectedCourse.price / selectedCourse.lessonCount).toFixed(2)}`
                        : '—'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Starts</div>
                  <div className="text-base font-semibold text-foreground">
                    {selectedCourse?.startDate
                      ? new Date(selectedCourse.startDate).toLocaleDateString()
                      : 'TBA'}
                  </div>
                </div>
              </div>
            </DialogPanel>
            <DialogPanel>
              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Schedule</div>
                <div className="text-base font-semibold text-foreground">
                  {selectedCourse?.scheduleSummary?.trim() || 'Schedule to be announced'}
                </div>
              </div>
            </DialogPanel>
            <DialogPanel>
              <h3 className="mb-4 text-lg font-semibold text-foreground">About this course</h3>
              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {selectedCourse?.description || 'More details will be available soon.'}
              </p>
            </DialogPanel>
            <DialogPanel>
              <div className="grid grid-cols-[auto_1fr] gap-4">
                {/* Left column: heading + photo + name */}
                <div className="flex flex-col gap-4">
                  <h3 className="text-lg font-semibold text-foreground">About the tutor</h3>
                  <div className="flex items-start gap-4">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                      {selectedCourse?.tutor?.avatarUrl ? (
                        <img
                          src={selectedCourse.tutor.avatarUrl}
                          alt={selectedCourse.tutor.name || 'Tutor'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <User className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-[140px] shrink-0">
                      <div className="text-base font-semibold text-foreground">
                        {selectedCourse?.tutor?.name || 'Anonymous Tutor'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        @{selectedCourse?.tutor?.username || 'tutor'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right column: bio */}
                {selectedCourse?.tutor?.bio && (
                  <div className="hidden self-stretch md:block">
                    <div className="h-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="line-clamp-5 text-sm leading-snug text-muted-foreground">
                        {selectedCourse.tutor.bio}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {selectedCourse?.tutor?.createdAt && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <span>
                        Tutor Since{' '}
                        <span className="font-semibold text-foreground">
                          {new Date(selectedCourse.tutor.createdAt).toLocaleDateString('en-US', {
                            month: '2-digit',
                            day: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </span>
                    </div>
                    <div className="h-4 w-px bg-border" />
                  </>
                )}
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Active Courses{' '}
                    <span className="font-semibold text-foreground">
                      {selectedCourse?.tutor?.activeCourses ?? 0}
                    </span>
                  </span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Country{' '}
                    <span className="font-semibold text-foreground">
                      {selectedCourse?.tutor?.country || '—'}
                    </span>
                  </span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="font-semibold text-emerald-600">Verified</span>
                </div>
              </div>
            </DialogPanel>
          </div>
          <DialogFooter className="gap-3">
            <Button
              variant="modal-primary-dark"
              onClick={() => {
                const username = selectedCourse?.tutor?.username || ''
                setSelectedCourse(null)
                if (username) {
                  router.push(`/u/${encodeURIComponent(username)}`)
                }
              }}
            >
              Go To Public Page
            </Button>
            <Button
              variant="modal-secondary-dark"
              onClick={() => setSelectedCourse(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

const BlankTutorCard = ({ theme, mode }: { theme: ColorTheme; mode: ThemeMode }) => {
  const themeColors = {
    emerald: 'from-emerald-500/10 to-blue-500/10 border-emerald-500/20',
    ocean: 'from-sky-500/10 to-indigo-500/10 border-sky-500/20',
    sunset: 'from-amber-500/10 to-rose-500/10 border-amber-500/20',
    galaxy: 'from-purple-500/10 to-pink-500/10 border-purple-500/20',
  }

  return (
    <motion.div
      whileHover={{
        rotateY: 20,
        rotateX: -10,
        scale: 1.1,
        y: -15,
      }}
      style={{
        perspective: 1200,
        transformStyle: 'preserve-3d',
      }}
      className={`relative mx-6 h-72 w-52 shrink-0 overflow-hidden rounded-3xl border transition-all duration-500 ${
        mode === 'dark'
          ? `bg-gradient-to-br ${themeColors[theme]} border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)]`
          : `border-white/40 bg-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]`
      }`}
    >
      {/* 3D Glass Layers */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent" />
      <div className="absolute -inset-2 bg-gradient-to-br from-white/10 via-transparent to-black/5 opacity-50" />

      {/* Profile Avatar Placeholder with 3D shadow */}
      <div
        className="flex h-full flex-col items-center justify-center p-8 text-center"
        style={{ transform: 'translateZ(40px)' }}
      >
        <div
          className={`relative mb-6 flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed shadow-inner ${
            mode === 'dark' ? 'border-white/10 bg-white/5' : 'border-black/5 bg-black/5'
          }`}
        >
          <UserPlus
            className={`h-10 w-10 ${mode === 'dark' ? 'text-white/10' : 'text-black/10'}`}
          />
          <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500/40 blur-md" />
        </div>

        {/* Text Placeholders with glow */}
        <div
          className={`mb-3 h-4 w-32 rounded-full blur-[0.5px] ${
            mode === 'dark' ? 'bg-white/10' : 'bg-black/5'
          }`}
        />
        <div
          className={`h-3 w-20 rounded-full blur-[0.5px] ${
            mode === 'dark' ? 'bg-white/5' : 'bg-black/5'
          }`}
        />
      </div>

      {/* Dynamic Shine Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      {/* Edge highlight */}
      <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/20" />
    </motion.div>
  )
}

const TutorStrip = ({ theme, mode }: { theme: ColorTheme; mode: ThemeMode }) => (
  <div className="relative overflow-hidden py-12">
    <div className="animate-marquee flex whitespace-nowrap">
      {[...Array(12)].map((_, i) => (
        <BlankTutorCard key={i} theme={theme} mode={mode} />
      ))}
      {[...Array(12)].map((_, i) => (
        <BlankTutorCard key={`dup-${i}`} theme={theme} mode={mode} />
      ))}
    </div>
  </div>
)

const ComingSoonModal = ({
  isOpen,
  onClose,
  type,
  lang,
  theme,
  mode,
}: {
  isOpen: boolean
  onClose: () => void
  type: ModalType
  lang: Language
  theme: ColorTheme
  mode: ThemeMode
}) => {
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    about: '',
    socialMedia: '',
    school: '',
    website: '',
    message: '',
    youtube: '',
    instagram: '',
    tiktok: '',
    facebook: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSubmitted(false)
    setFormData({
      email: '',
      name: '',
      about: '',
      socialMedia: '',
      school: '',
      website: '',
      message: '',
      youtube: '',
      instagram: '',
      tiktok: '',
      facebook: '',
    })
    setError('')
  }, [type])

  const t = (key: string) => translations[key]?.[lang] || translations[key]?.['en'] || key

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type || 'register',
          ...formData,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSubmitted(true)
      } else {
        setError(data.error || 'Failed to submit. Please try again.')
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const themeColors = {
    emerald: {
      primary: 'bg-emerald-500 hover:bg-emerald-400',
      light: 'bg-emerald-100 text-emerald-700',
    },
    ocean: { primary: 'bg-sky-500 hover:bg-sky-400', light: 'bg-sky-100 text-sky-700' },
    sunset: { primary: 'bg-amber-500 hover:bg-amber-400', light: 'bg-amber-100 text-amber-700' },
    galaxy: {
      primary: 'bg-purple-500 hover:bg-purple-400',
      light: 'bg-purple-100 text-purple-700',
    },
  }

  if (!isOpen) return null

  // Tutor form content
  const renderTutorForm = () => (
    <>
      <Input
        type="text"
        placeholder="Name"
        value={formData.name}
        onChange={e => setFormData({ ...formData, name: e.target.value })}
        required
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <Input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={e => setFormData({ ...formData, email: e.target.value })}
        required
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <textarea
        placeholder="Tell us about your tutoring (500 characters max)"
        value={formData.about}
        onChange={e => setFormData({ ...formData, about: e.target.value.slice(0, 500) })}
        required
        rows={3}
        className={`w-full resize-none rounded-lg border px-3 py-2 text-sm ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <div
        className={`mb-1 text-xs font-medium ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}
      >
        Social Media (optional)
      </div>
      <Input
        type="text"
        placeholder="YouTube username"
        value={formData.youtube}
        onChange={e => setFormData({ ...formData, youtube: e.target.value })}
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <Input
        type="text"
        placeholder="Instagram username"
        value={formData.instagram}
        onChange={e => setFormData({ ...formData, instagram: e.target.value })}
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <Input
        type="text"
        placeholder="TikTok username"
        value={formData.tiktok}
        onChange={e => setFormData({ ...formData, tiktok: e.target.value })}
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <Input
        type="text"
        placeholder="Facebook username"
        value={formData.facebook}
        onChange={e => setFormData({ ...formData, facebook: e.target.value })}
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      {error && <p className="text-center text-sm text-red-500">{error}</p>}
      <Button
        type="submit"
        disabled={loading}
        className={`w-full rounded-xl py-3 font-semibold text-white ${themeColors[theme].primary} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {loading ? 'Submitting...' : 'Confirm'}
      </Button>
    </>
  )

  // Academy form content
  const renderAcademyForm = () => (
    <>
      <h3 className={`mb-4 text-xl font-bold ${mode === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
        Solocorn Academy
      </h3>
      <Input
        type="text"
        placeholder="Name"
        value={formData.name}
        onChange={e => setFormData({ ...formData, name: e.target.value })}
        required
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <Input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={e => setFormData({ ...formData, email: e.target.value })}
        required
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <textarea
        placeholder="Tell us about your academy"
        value={formData.about}
        onChange={e => setFormData({ ...formData, about: e.target.value })}
        required
        rows={3}
        className={`w-full resize-none rounded-lg border px-3 py-2 text-sm ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <Input
        type="text"
        placeholder="Social media (optional)"
        value={formData.socialMedia}
        onChange={e => setFormData({ ...formData, socialMedia: e.target.value })}
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <p className={`text-xs ${mode === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>
        Unsubscribe at anytime
      </p>
      {error && <p className="text-center text-sm text-red-500">{error}</p>}
      <Button
        type="submit"
        disabled={loading}
        className={`w-full rounded-xl py-3 font-semibold text-white ${themeColors[theme].primary} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {loading ? 'Submitting...' : 'Confirm'}
      </Button>
    </>
  )

  // Schools form content
  const renderSchoolsForm = () => (
    <>
      <Input
        type="text"
        placeholder="Name"
        value={formData.name}
        onChange={e => setFormData({ ...formData, name: e.target.value })}
        required
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <Input
        type="text"
        placeholder="School"
        value={formData.school}
        onChange={e => setFormData({ ...formData, school: e.target.value })}
        required
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <Input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={e => setFormData({ ...formData, email: e.target.value })}
        required
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <Input
        type="text"
        placeholder="Website"
        value={formData.website}
        onChange={e => setFormData({ ...formData, website: e.target.value })}
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <textarea
        placeholder="Message (500 characters max)"
        value={formData.message}
        onChange={e => setFormData({ ...formData, message: e.target.value.slice(0, 500) })}
        required
        rows={3}
        className={`w-full resize-none rounded-lg border px-3 py-2 text-sm ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      {error && <p className="text-center text-sm text-red-500">{error}</p>}
      <Button
        type="submit"
        disabled={loading}
        className={`w-full rounded-xl py-3 font-semibold text-white ${themeColors[theme].primary} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {loading ? 'Submitting...' : 'Confirm'}
      </Button>
    </>
  )

  // Default form
  const renderDefaultForm = () => (
    <>
      <Input
        type="text"
        placeholder={t('yourName')}
        value={formData.name}
        onChange={e => setFormData({ ...formData, name: e.target.value })}
        required
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      <Input
        type="email"
        placeholder={t('emailAddress')}
        value={formData.email}
        onChange={e => setFormData({ ...formData, email: e.target.value })}
        required
        className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
      />
      {error && <p className="text-center text-sm text-red-500">{error}</p>}
      <Button
        type="submit"
        disabled={loading}
        className={`w-full rounded-xl py-3 font-semibold text-white ${themeColors[theme].primary} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {loading ? 'Submitting...' : t('notifyMe')}
      </Button>
    </>
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
        <div className="absolute inset-0 bg-black/80" onClick={onClose} onWheel={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={`relative w-full max-w-md rounded-2xl border p-8 shadow-2xl ${mode === 'dark' ? 'border-white/10 bg-zinc-900' : 'border-black/10 bg-white'}`}
        >
          <button
            onClick={onClose}
            className={`absolute right-4 top-4 p-2 transition-colors ${mode === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-zinc-600 hover:text-black'}`}
          >
            <X className="h-5 w-5" />
          </button>
          {!submitted ? (
            <>
              {type !== 'schools' && (
                <div className="mb-6 text-center">
                  <div
                    className={`mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${mode === 'dark' ? `bg-${theme}-500/10 border-${theme}-500/20 text-${theme}-400` : themeColors[theme].light}`}
                  >
                    <Sparkles className="h-3 w-3" />
                    {t('comingSoon')}
                  </div>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                {type === 'tutor' && renderTutorForm()}
                {type === 'academy' && renderAcademyForm()}
                {type === 'schools' && renderSchoolsForm()}
                {(type === 'register' || !type) && renderDefaultForm()}
              </form>
            </>
          ) : (
            <div className="py-8 text-center">
              <div
                className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${mode === 'dark' ? `bg-${theme}-500/20` : themeColors[theme].light}`}
              >
                <CheckCircle
                  className={`h-8 w-8 ${mode === 'dark' ? `text-${theme}-400` : `text-${theme}-600`}`}
                />
              </div>
              <h3
                className={`mb-2 text-xl font-bold ${mode === 'dark' ? 'text-white' : 'text-zinc-900'}`}
              >
                {t('thankYou')}
              </h3>
              <p className={mode === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}>
                {t('successMessageRegister')}
              </p>
              <Button
                onClick={onClose}
                className={`mt-6 ${mode === 'dark' ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-black/10 text-zinc-900 hover:bg-black/20'}`}
              >
                {t('close')}
              </Button>
            </div>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const SpecialAccessSection = ({
  lang,
  triggerLabel,
  triggerClassName,
  popoverPlacement = 'top',
}: {
  lang: Language
  triggerLabel: string
  triggerClassName: string
  popoverPlacement?: 'top' | 'bottom'
}) => {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)
  const router = useRouter()
  const t = (key: string) => translations[key]?.[lang] || translations[key]?.['en'] || key

  useEffect(() => {
    if (!expanded) return

    const width = 260
    const margin = 12

    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return

      const left = Math.min(
        window.innerWidth - width - margin,
        Math.max(margin, rect.right - width)
      )
      const top =
        popoverPlacement === 'bottom'
          ? rect.bottom + margin
          : Math.max(margin, rect.top - margin - 84)

      setPopoverPos({ top, left })
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [expanded, popoverPlacement])

  const checkAccess = () => {
    const trimmed = code.trim()
    if (SPECIAL_CODES.includes(trimmed)) {
      setExpanded(false)
      window.location.assign('/login')
    } else {
      setError(true)
      setTimeout(() => setError(false), 2000)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    checkAccess()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        ref={triggerRef}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>

      {expanded && (
        <>
          <div className="fixed inset-0 z-[990] animate-in fade-in duration-150" onClick={() => setExpanded(false)} />
          <div
            className="fixed z-[1000] animate-in fade-in zoom-in-95 duration-150"
            style={popoverPos ?? undefined}
            onClick={e => e.stopPropagation()}
          >
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder={t('enterCode')}
                value={code}
                onChange={e => setCode(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                autoFocus
                className={`h-10 w-[260px] rounded-full border border-white/20 bg-white/10 px-4 text-sm text-white placeholder:text-white/60 shadow-md backdrop-blur-sm focus:outline-none focus-visible:!shadow-none ${error ? 'border-red-400' : ''}`}
              />
            </form>
            {error && <p className="mt-2 text-xs font-medium text-red-300">{t('invalidCode')}</p>}
          </div>
        </>
      )}
    </div>
  )
}

const ActionCard = ({
  title,
  copy,
  buttonText,
  icon: Icon,
  onClick,
  theme,
  mode,
}: {
  title: string
  copy: string
  buttonText: string
  icon: any
  onClick: () => void
  theme: ColorTheme
  mode: ThemeMode
}) => {
  const themeColors = {
    emerald: {
      border: 'border-emerald-500/30',
      hover: 'hover:border-emerald-500/50',
      icon: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      button: 'bg-white text-black hover:bg-emerald-400',
    },
    ocean: {
      border: 'border-sky-500/30',
      hover: 'hover:border-sky-500/50',
      icon: 'text-sky-400',
      bg: 'bg-sky-500/10',
      button: 'bg-white text-black hover:bg-sky-400',
    },
    sunset: {
      border: 'border-amber-500/30',
      hover: 'hover:border-amber-500/50',
      icon: 'text-amber-400',
      bg: 'bg-amber-500/10',
      button: 'bg-white text-black hover:bg-amber-400',
    },
    galaxy: {
      border: 'border-purple-500/30',
      hover: 'hover:border-purple-500/50',
      icon: 'text-purple-400',
      bg: 'bg-purple-500/10',
      button: 'bg-white text-black hover:bg-purple-400',
    },
  }

  return (
    <motion.div
      whileHover={{ y: -5 }}
      className={`border backdrop-blur-md ${themeColors[theme].border} ${themeColors[theme].hover} group flex h-full flex-col items-start justify-between rounded-2xl p-8 transition-colors hover:border-emerald-500/30 ${mode === 'dark' ? 'bg-zinc-900/60' : 'bg-white/60'}`}
    >
      <div className="mb-6">
        <div
          className={`h-12 w-12 rounded-xl ${themeColors[theme].bg} mb-6 flex items-center justify-center transition-colors group-hover:bg-opacity-20`}
        >
          <Icon className={`h-6 w-6 ${themeColors[theme].icon}`} />
        </div>
        <h3
          className={`mb-3 text-2xl font-bold ${mode === 'dark' ? 'text-white' : 'text-zinc-900'}`}
        >
          {title}
        </h3>
        {copy && (
          <p className={`leading-relaxed ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
            {copy}
          </p>
        )}
      </div>
      <Button
        onClick={onClick}
        className={`w-full rounded-xl px-6 py-3 font-semibold transition-colors ${themeColors[theme].button}`}
      >
        {buttonText}
      </Button>
    </motion.div>
  )
}

const Navbar = ({
  lang,
  onLanguageChange,
  theme,
  mode,
}: {
  lang: Language
  onLanguageChange: (lang: Language) => void
  theme: ColorTheme
  mode: ThemeMode
}) => {
  const t = (key: string) => translations[key]?.[lang] || translations[key]?.['en'] || key

  return (
    <nav className="fixed left-0 right-0 top-0 z-50 px-6 py-4">
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between rounded-2xl border px-6 py-3 backdrop-blur-md ${mode === 'dark' ? 'border-white/10 bg-zinc-900/60' : 'border-black/10 bg-white/60'}`}
      >
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/images/logo.png"
            alt="Solocorn"
            className="h-8 w-auto rounded px-1 transition-colors"
            onError={e => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </Link>
        <div className="flex items-center gap-3">
          <LanguageSelector currentLang={lang} onChange={onLanguageChange} theme={theme} />
        </div>
      </div>
    </nav>
  )
}

// --- Contact Modal Component ---

const ContactModal = ({
  isOpen,
  onClose,
  lang,
  mode,
}: {
  isOpen: boolean
  onClose: () => void
  lang: Language
  mode: ThemeMode
}) => {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const t = (key: string) => translations[key]?.[lang] || translations[key]?.['en'] || key

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'contact',
          ...formData,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSubmitted(true)
        setTimeout(() => {
          setSubmitted(false)
          setFormData({ name: '', email: '', message: '' })
          onClose()
        }, 3000)
      } else {
        setError(data.error || 'Failed to send message. Please try again.')
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-black/80" onClick={onClose} />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={`relative w-full max-w-md rounded-2xl border p-8 shadow-2xl ${mode === 'dark' ? 'border-white/10 bg-zinc-900' : 'border-black/10 bg-white'}`}
        >
          <button
            onClick={onClose}
            className={`absolute right-4 top-4 p-2 transition-colors ${mode === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-zinc-600 hover:text-black'}`}
          >
            <X className="h-5 w-5" />
          </button>

          {!submitted ? (
            <>
              <div className="mb-6 text-center">
                <div
                  className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${mode === 'dark' ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}
                >
                  <Mail
                    className={`h-6 w-6 ${mode === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}
                  />
                </div>
                <h3
                  className={`mb-2 text-2xl font-bold ${mode === 'dark' ? 'text-white' : 'text-zinc-900'}`}
                >
                  Contact Us
                </h3>
                <p className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Send us a message and we'll get back to you soon.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    className={`mb-1 block text-sm font-medium ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}
                  >
                    Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Your name"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                    className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
                  />
                </div>
                <div>
                  <label
                    className={`mb-1 block text-sm font-medium ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}
                  >
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    required
                    className={`w-full border ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
                  />
                </div>
                <div>
                  <label
                    className={`mb-1 block text-sm font-medium ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}
                  >
                    Message
                  </label>
                  <textarea
                    placeholder="How can we help you?"
                    value={formData.message}
                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                    required
                    rows={4}
                    className={`w-full resize-none rounded-lg border px-3 py-2 ${mode === 'dark' ? 'border-white/10 bg-white/5 text-white placeholder:text-zinc-500' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500'}`}
                  />
                </div>
                {error && <p className="text-center text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Message'}
                </Button>
              </form>

              <p
                className={`mt-4 text-center text-xs ${mode === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}
              >
                You can also email us directly at support@solocorn.co
              </p>
            </>
          ) : (
            <div className="py-8 text-center">
              <div
                className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${mode === 'dark' ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}
              >
                <CheckCircle
                  className={`h-8 w-8 ${mode === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}
                />
              </div>
              <h3
                className={`mb-2 text-xl font-bold ${mode === 'dark' ? 'text-white' : 'text-zinc-900'}`}
              >
                Message Sent!
              </h3>
              <p className={mode === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}>
                Thank you for reaching out. We'll be in touch soon.
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// --- Legal Modals ---

const PrivacyPolicyModal = ({
  isOpen,
  onClose,
  mode,
}: {
  isOpen: boolean
  onClose: () => void
  mode: ThemeMode
}) => {
  if (!isOpen) return null

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-black/80" onClick={onClose} />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={`relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-8 shadow-2xl ${mode === 'dark' ? 'border-white/10 bg-zinc-900' : 'border-black/10 bg-white'}`}
        >
          <button
            onClick={onClose}
            className={`absolute right-4 top-4 p-2 transition-colors ${mode === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-zinc-600 hover:text-black'}`}
          >
            <X className="h-5 w-5" />
          </button>
          <h2
            className={`mb-6 text-2xl font-bold ${mode === 'dark' ? 'text-white' : 'text-zinc-900'}`}
          >
            Privacy Policy
          </h2>
          <div
            className={`space-y-4 text-sm ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}
          >
            <p>Last updated: March 2025</p>
            <h3 className="mt-4 font-semibold">1. Information We Collect</h3>
            <p>
              We collect information you provide directly to us, including name, email address, and
              any other information you choose to provide when using our platform.
            </p>
            <h3 className="mt-4 font-semibold">2. How We Use Your Information</h3>
            <p>
              We use the information we collect to provide, maintain, and improve our services,
              communicate with you, and develop new features.
            </p>
            <h3 className="mt-4 font-semibold">3. Information Sharing</h3>
            <p>
              We do not sell, trade, or otherwise transfer your personally identifiable information
              to outside parties except as described in this policy.
            </p>
            <h3 className="mt-4 font-semibold">4. Data Security</h3>
            <p>
              We implement appropriate technical and organizational measures to protect your
              personal data against unauthorized access, alteration, or destruction.
            </p>
            <h3 className="mt-4 font-semibold">5. Your Rights</h3>
            <p>
              You have the right to access, correct, or delete your personal information. Contact us
              at support@solocorn.co for any privacy-related requests.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

const TermsOfServiceModal = ({
  isOpen,
  onClose,
  mode,
}: {
  isOpen: boolean
  onClose: () => void
  mode: ThemeMode
}) => {
  if (!isOpen) return null

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-black/80" onClick={onClose} />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={`relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-8 shadow-2xl ${mode === 'dark' ? 'border-white/10 bg-zinc-900' : 'border-black/10 bg-white'}`}
        >
          <button
            onClick={onClose}
            className={`absolute right-4 top-4 p-2 transition-colors ${mode === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-zinc-600 hover:text-black'}`}
          >
            <X className="h-5 w-5" />
          </button>
          <h2
            className={`mb-6 text-2xl font-bold ${mode === 'dark' ? 'text-white' : 'text-zinc-900'}`}
          >
            Terms of Service
          </h2>
          <div
            className={`space-y-4 text-sm ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}
          >
            <p>Last updated: March 2025</p>
            <h3 className="mt-4 font-semibold">1. Acceptance of Terms</h3>
            <p>
              By accessing or using Solocorn's services, you agree to be bound by these Terms of
              Service and all applicable laws and regulations.
            </p>
            <h3 className="mt-4 font-semibold">2. Use of Service</h3>
            <p>
              You agree to use the service only for lawful purposes and in accordance with these
              Terms. You are responsible for all content you provide.
            </p>
            <h3 className="mt-4 font-semibold">3. User Accounts</h3>
            <p>
              You are responsible for safeguarding your account credentials and for any activities
              under your account. Notify us immediately of any unauthorized use.
            </p>
            <h3 className="mt-4 font-semibold">4. Intellectual Property</h3>
            <p>
              All content and materials available on Solocorn are the property of Solocorn LLC and
              are protected by applicable intellectual property laws.
            </p>
            <h3 className="mt-4 font-semibold">5. Limitation of Liability</h3>
            <p>
              Solocorn shall not be liable for any indirect, incidental, special, consequential, or
              punitive damages resulting from your use of the service.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// --- Category Search Modal sub-components ---

const EmptyState = ({
  search,
  fallbackText,
}: {
  search: string
  fallbackText: string
}) => (
  <div className="py-12 text-center text-slate-500">
    <Search className="mx-auto mb-3 h-12 w-12 text-slate-300" />
    <p className="text-sm">{search ? `No results for "${search}"` : fallbackText}</p>
  </div>
)

const CategorySection = ({
  label,
  icon: Icon,
  exams,
  categorySearch,
  selectedCategories,
  onToggleCategory,
  color,
}: {
  label: string
  icon: React.ElementType
  exams: string[]
  categorySearch: string
  selectedCategories: string[]
  onToggleCategory: (category: string) => void
  color?: string
}) => {
  const filtered = categorySearch
    ? exams.filter(e => e.toLowerCase().includes(categorySearch.toLowerCase()))
    : exams
  if (filtered.length === 0) return null
  return (
    <div className="space-y-4">
      <h4 className="flex items-center gap-2 text-xs font-medium text-white">
        <Icon className="h-4 w-4 text-white/80" />
        {label}
      </h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((exam, idx) => (
          <label
            key={`${label}-${idx}-${exam}`}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[11px] text-white/90 transition-colors hover:bg-white/10"
          >
            <div className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                checked={selectedCategories.includes(exam)}
                onChange={() => onToggleCategory(exam)}
                className="h-3.5 w-3.5 appearance-none rounded-full border border-white/50 transition-colors"
                style={{
                  borderColor: selectedCategories.includes(exam) ? (color || '#4F46E5') : 'rgba(255,255,255,0.5)',
                  backgroundColor: selectedCategories.includes(exam) ? (color || '#4F46E5') : 'transparent',
                }}
              />
            </div>
            <span className="line-clamp-2">{exam}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// --- Category Search Modal (based on Course Details category panel) ---

const CategorySearchModal = ({
  isOpen,
  onClose,
  onSelectCategory,
  lang,
  mode,
}: {
  isOpen: boolean
  onClose: () => void
  onSelectCategory: (categories: string[]) => void
  lang: Language
  mode: ThemeMode
}) => {
  const [categorySearch, setCategorySearch] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState('global')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [globalContentHeight, setGlobalContentHeight] = useState<number>(480)
  const globalContentRef = useRef<HTMLDivElement>(null)

  // Badge bar scroll navigation
  const badgeScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = badgeScrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
  }, [])

  const scrollBadges = (amount: number) => {
    badgeScrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' })
  }

  useEffect(() => {
    checkScroll()
    const el = badgeScrollRef.current
    if (!el) return
    el.addEventListener('scroll', checkScroll)
    window.addEventListener('resize', checkScroll)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, selectedCategories, selectedCountries])

  const t = (key: string) => translations[key]?.[lang] || translations[key]?.['en'] || key

  const TAB_COLORS: Record<string, { bg: string; text: string; close: string }> = {
    global:       { bg: 'bg-[#0A84FF]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    ap:           { bg: 'bg-[#FF1493]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    alevel:       { bg: 'bg-[#BF5AF2]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    ib:           { bg: 'bg-[#32D74B]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    igcse:        { bg: 'bg-[#64D2FF]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    national:     { bg: 'bg-[#FF9F0A]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    universities: { bg: 'bg-[#FF375F]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    languages:    { bg: 'bg-[#00C7BE]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    professional: { bg: 'bg-[#8E8E93]', text: 'text-white', close: 'text-white/60 hover:text-white' },
  }
  const UNIVERSITY_TO_COUNTRY = useMemo(() => {
    const map = new Map<string, string>()
    Object.entries(UNIVERSITIES_BY_COUNTRY_CODE).forEach(([code, universities]) => {
      const countryName = ALL_COUNTRIES.find(c => c.code === code)?.name || code
      universities.forEach((u: string) => map.set(u, countryName))
    })
    return map
  }, [])

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCategorySearch('')
      setSelectedRegion('')
      setSelectedCountries([])
      setActiveTab('global')
      setSelectedCategories([])
    }
  }, [isOpen])

  // Lock body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  const toggleCategory = (exam: string) => {
    setSelectedCategories(prev =>
      prev.includes(exam) ? prev.filter(c => c !== exam) : [...prev, exam]
    )
  }

  const removeCategory = (exam: string) => {
    setSelectedCategories(prev => prev.filter(c => c !== exam))
  }

  const toggleCountry = (code: string) => {
    setSelectedCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const removeCountry = (code: string) => {
    setSelectedCountries(prev => prev.filter(c => c !== code))
  }

  const availableCountries = selectedRegion
    ? REGIONS.find(r => r.id === selectedRegion)?.countries || []
    : []

  const nationalExams = selectedCountries.length > 0
    ? selectedCountries.flatMap(code => NATIONAL_EXAMS_DATA[code] || [])
    : selectedRegion
      ? (REGIONS.find(r => r.id === selectedRegion)?.countries.flatMap(c => c.nationalExams) || [])
      : []

  const filteredUniversityCategories = selectedCountries.length > 0
    ? selectedCountries
        .flatMap(code =>
          UNIVERSITIES_BY_COUNTRY_CODE[code]
            ? [{ id: `universities-${code}`, label: 'Universities', exams: UNIVERSITIES_BY_COUNTRY_CODE[code] }]
            : []
        )
    : selectedRegion
      ? UNIVERSITY_CATEGORIES.filter(u => u.id === `universities-${selectedRegion}`)
      : UNIVERSITY_CATEGORIES

  const examToTabKey = useMemo(() => {
    const map = new Map<string, string>()
    const add = (cats: ExamCategory[], key: string) => cats.forEach(c => c.exams.forEach(e => map.set(e, key)))
    add(GLOBAL_EXAMS_CATEGORIES, 'global')
    add(AP_CATEGORIES, 'ap')
    add(A_LEVEL_CATEGORIES, 'alevel')
    add(IB_CATEGORIES, 'ib')
    add(IGCSE_CATEGORIES, 'igcse')
    add(LANGUAGE_CATEGORIES, 'languages')
    add(PROFESSIONAL_CATEGORIES, 'professional')
    add(nationalExams, 'national')
    add(filteredUniversityCategories, 'universities')
    return map
  }, [nationalExams, filteredUniversityCategories])

  const filterExams = (exams: string[]) =>
    categorySearch
      ? exams.filter(e => e.toLowerCase().includes(categorySearch.toLowerCase()))
      : exams

  // Measure Global tab content height to establish container size for other tabs
  useLayoutEffect(() => {
    if (activeTab !== 'global') return
    if (globalContentRef.current) {
      setGlobalContentHeight(globalContentRef.current.scrollHeight + 48)
    }
  }, [activeTab, isOpen])

  const hasResults = (exams: string[]) => filterExams(exams).length > 0

  const tabTriggerClass =
    'rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-slate-500 data-[state=active]:border-white data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} onWheel={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} />
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="relative shrink-0 px-6 pt-4 pb-4">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 p-2 text-white/70 transition-colors hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="mb-1 text-2xl font-bold text-white">
              {t('browseCategories')}
            </h2>
            <p className="mb-3 text-sm text-white/70">
              {t('selectCategoryPrompt')}
            </p>

            {/* Selected category badges container + Search */}
            <div className="mb-1 flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <div
                  ref={badgeScrollRef}
                  className="flex h-10 min-w-0 items-center overflow-x-auto scrollbar-hide rounded-md border border-slate-200 bg-white px-6 py-1"
                >
                  <div className="flex min-w-0 flex-nowrap items-center gap-2">
                    {selectedCategories.length === 0 && (
                      <span className="select-none text-sm text-slate-400">
                        {t('selectCategoryBadgePlaceholder')}
                      </span>
                    )}
                    {selectedCategories.flatMap(cat => {
                      const colors = TAB_COLORS[examToTabKey.get(cat) || ''] || { bg: 'bg-blue-50', text: 'text-[#0A84FF]', close: 'text-[#0A84FF]/60 hover:text-[#0A84FF]' }
                      if (selectedCountries.length === 0) {
                        return (
                          <span
                            key={cat}
                            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full ${colors.bg} px-3 py-1 text-xs font-medium ${colors.text}`}
                          >
                            {examToTabKey.get(cat) === 'universities' ? `${cat} - ${UNIVERSITY_TO_COUNTRY.get(cat) || 'Global'}` : `${cat} - Global`}
                            <button
                              onClick={() => removeCategory(cat)}
                              className={`ml-0.5 ${colors.close}`}
                              aria-label={`Remove ${cat}`}
                            >
                              ×
                            </button>
                          </span>
                        )
                      }
                      return selectedCountries.map(code => {
                        const countryName = ALL_COUNTRIES.find(c => c.code === code)?.name || code
                        return (
                          <span
                            key={`${cat}-${code}`}
                            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full ${colors.bg} px-3 py-1 text-xs font-medium ${colors.text}`}
                          >
                            {cat} - {countryName}
                            <button
                              onClick={() => removeCategory(cat)}
                              className={`ml-0.5 ${colors.close}`}
                              aria-label={`Remove ${cat}`}
                            >
                              ×
                            </button>
                          </span>
                        )
                      })
                    })}
                  </div>
                </div>
                <div className={cn('mt-1 flex items-center justify-end gap-1', (canScrollLeft || canScrollRight) ? 'visible' : 'invisible')}>
                  <button
                    onClick={() => scrollBadges(-200)}
                    disabled={!canScrollLeft}
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                      canScrollLeft
                        ? 'bg-white/20 text-white hover:bg-white/30'
                        : 'text-white/30'
                    )}
                    aria-label="Scroll left"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => scrollBadges(200)}
                    disabled={!canScrollRight}
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                      canScrollRight
                        ? 'bg-white/20 text-white hover:bg-white/30'
                        : 'text-white/30'
                    )}
                    aria-label="Scroll right"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <Button
                onClick={() => {
                  const countryNames = selectedCountries.map(code => ALL_COUNTRIES.find(c => c.code === code)?.name || code)
                  onSelectCategory([...selectedCategories, ...countryNames])
                }}
                disabled={selectedCategories.length === 0}
                className={`h-10 shrink-0 px-5 text-sm focus-visible:!shadow-none focus:outline-none ${
                  selectedCategories.length === 0
                    ? 'rounded-md border border-white bg-white/10 text-white shadow-md backdrop-blur-sm disabled:opacity-50'
                    : 'rounded-md border !border-white bg-blue-700 text-white hover:bg-blue-600 hover:!border-blue-700'
                }`}
              >
                Search
              </Button>
            </div>

            {/* Region & Country dropdowns */}
            <div className="flex flex-wrap gap-3">
              <Select value={selectedRegion} onValueChange={v => { setSelectedRegion(v); setSelectedCountries([]) }}>
                <SelectTrigger className="h-[30px] w-[160px] rounded-sm border border-slate-700/25 bg-white/30 text-sm text-white shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white/60 hover:border-slate-700/50 hover:shadow-md focus-visible:!shadow-none focus:outline-none focus-visible:outline-none">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent className="rounded-lg border border-slate-700/25 bg-none bg-white/30 p-1.5 shadow-lg backdrop-blur-xl w-[var(--radix-select-trigger-width)]">
                  {REGIONS.filter(r => r.id !== 'global').map(region => (
                    <SelectItem key={region.id} value={region.id} className="text-white focus:text-white hover:bg-white/20 focus:bg-white/20 mx-1.5 focus:outline-none rounded-md">{region.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={!selectedRegion}
                    className="inline-flex h-[30px] w-[160px] items-center justify-between rounded-sm border border-slate-700/25 bg-white/30 px-3 text-sm text-white shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white/60 hover:border-slate-700/50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-100/20 disabled:border-slate-400/20 disabled:text-slate-400 disabled:backdrop-blur-none disabled:hover:bg-slate-100/20 disabled:hover:border-slate-400/20 disabled:hover:shadow-none focus-visible:!shadow-none focus:outline-none"
                  >
                    <span className="truncate">
                      {selectedCountries.length > 0
                        ? `${selectedCountries.length} countr${selectedCountries.length === 1 ? 'y' : 'ies'}`
                        : 'Country'}
                    </span>
                    <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </PopoverTrigger>
                <PopoverContent variant="panel" className="rounded-lg border border-slate-700/25 bg-white/30 text-white p-1.5 shadow-lg backdrop-blur-xl w-[160px]" align="start">
                  <div className="flex flex-col gap-1">
                    {availableCountries.map(country => (
                      <label
                        key={country.code}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white hover:bg-white/20"
                        onClick={() => toggleCountry(country.code)}
                      >
                        <div
                          className={cn(
                            'h-4 w-4 rounded-full border-2 transition-colors',
                            selectedCountries.includes(country.code)
                              ? 'border-white bg-white'
                              : 'border-white/50 bg-transparent'
                          )}
                        />
                        <span>{country.name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

          </div>

          {/* Tabs Content */}
          <div className="w-full pl-6 pr-2 pb-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div>
                <TabsList className="flex w-full flex-wrap justify-between bg-transparent p-0">
                  <TabsTrigger value="global" className={tabTriggerClass} style={{ color: '#0A84FF' }}>
                    <Globe className="mr-1.5 h-4 w-4" /> Global
                  </TabsTrigger>
                  <TabsTrigger value="ap" className={tabTriggerClass}>
                    <Award className="mr-1.5 h-4 w-4 text-[#FF1493]" />
                    <span className="bg-gradient-to-b from-[#FF69B4] via-[#FF1493] to-[#C71585] bg-clip-text text-transparent font-semibold">AP</span>
                  </TabsTrigger>
                  <TabsTrigger value="alevel" className={tabTriggerClass} style={{ color: '#BF5AF2' }}>
                    <GraduationCap className="mr-1.5 h-4 w-4" /> A Level
                  </TabsTrigger>
                  <TabsTrigger value="ib" className={tabTriggerClass} style={{ color: '#32D74B' }}>
                    <BookOpen className="mr-1.5 h-4 w-4" /> IB
                  </TabsTrigger>
                  <TabsTrigger value="igcse" className={tabTriggerClass} style={{ color: '#64D2FF' }}>
                    <School className="mr-1.5 h-4 w-4" /> IGCSE
                  </TabsTrigger>
                  <TabsTrigger value="national" className={tabTriggerClass} disabled={nationalExams.length === 0} style={{ color: '#FF9F0A' }}>
                    <Flag className="mr-1.5 h-4 w-4" /> National
                  </TabsTrigger>
                  <TabsTrigger value="universities" className={tabTriggerClass} style={{ color: '#FF375F' }}>
                    <GraduationCap className="mr-1.5 h-4 w-4" /> Universities
                  </TabsTrigger>
                  <TabsTrigger value="languages" className={tabTriggerClass} style={{ color: '#00C7BE' }}>
                    <Globe className="mr-1.5 h-4 w-4" /> Languages
                  </TabsTrigger>
                  <TabsTrigger value="professional" className={tabTriggerClass} style={{ color: '#8E8E93' }}>
                    <Award className="mr-1.5 h-4 w-4" /> Professional
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Search — placed inside Tabs so it sits under the active tab */}
              <div className="relative z-10 pb-2 pt-[15px]">
                <div className="relative mx-auto max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder={t('searchCategories')}
                    value={categorySearch}
                    onChange={e => setCategorySearch(e.target.value)}
                    className="h-[34px] border-slate-200 bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:border-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>

              <div
                className={cn(
                  'overscroll-contain border-t border-white/10 pt-2 pb-4 scrollbar-no-arrows',
                  activeTab === 'global' ? 'overflow-hidden' : 'overflow-y-auto'
                )}
                style={{
                  height: globalContentHeight,
                  maxHeight: globalContentHeight,
                }}
              >
                {!categorySearch ? (
                  <>
                    {/* Global */}
                    <TabsContent value="global" className="mt-0 space-y-8">
                      <div ref={globalContentRef} className="space-y-8">
                        {GLOBAL_EXAMS_CATEGORIES.map(cat => (
                        <CategorySection key={cat.id} label={cat.label} icon={BookOpen} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#0A84FF" />
                      ))}
                      {!GLOBAL_EXAMS_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState search={categorySearch} fallbackText={t('noCategoriesAvailable')} />
                      )}
                      </div>
                    </TabsContent>

                    {/* AP */}
                    <TabsContent value="ap" className="mt-0 space-y-8">
                      {AP_CATEGORIES.map(cat => (
                        <CategorySection key={cat.id} label={cat.label} icon={Award} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#FF1493" />
                      ))}
                      {!AP_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState search={categorySearch} fallbackText={t('noCategoriesAvailable')} />
                      )}
                    </TabsContent>

                    {/* A Level */}
                    <TabsContent value="alevel" className="mt-0 space-y-8">
                      {A_LEVEL_CATEGORIES.map(cat => (
                        <CategorySection key={cat.id} label={cat.label} icon={GraduationCap} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#BF5AF2" />
                      ))}
                      {!A_LEVEL_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState search={categorySearch} fallbackText={t('noCategoriesAvailable')} />
                      )}
                    </TabsContent>

                    {/* IB */}
                    <TabsContent value="ib" className="mt-0 space-y-8">
                      {IB_CATEGORIES.map(cat => (
                        <CategorySection key={cat.id} label={cat.label} icon={BookOpen} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#32D74B" />
                      ))}
                      {!IB_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState search={categorySearch} fallbackText={t('noCategoriesAvailable')} />
                      )}
                    </TabsContent>

                    {/* IGCSE */}
                    <TabsContent value="igcse" className="mt-0 space-y-8">
                      {IGCSE_CATEGORIES.map(cat => (
                        <CategorySection key={cat.id} label={cat.label} icon={School} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#64D2FF" />
                      ))}
                      {!IGCSE_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState search={categorySearch} fallbackText={t('noCategoriesAvailable')} />
                      )}
                    </TabsContent>

                    {/* National */}
                    <TabsContent value="national" className="mt-0 space-y-8">
                      {nationalExams.map(cat => (
                        <CategorySection key={cat.id} label={cat.label} icon={Flag} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#FF9F0A" />
                      ))}
                      {nationalExams.length === 0 && (
                        <div className="py-12 text-center text-slate-500">
                          <Flag className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                          <p className="text-sm">{t('selectRegionCountryNational')}</p>
                        </div>
                      )}
                      {nationalExams.length > 0 && !nationalExams.some(cat => hasResults(cat.exams)) && (
                        <EmptyState search={categorySearch} fallbackText={t('noCategoriesAvailable')} />
                      )}
                    </TabsContent>

                    {/* Universities */}
                    <TabsContent value="universities" className="mt-0 space-y-8">
                      {!categorySearch && (
                        <div className="py-12 text-center text-slate-500">
                          <GraduationCap className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                          <p className="text-sm">Type a university name to search</p>
                        </div>
                      )}
                      {categorySearch && filteredUniversityCategories.map(cat => (
                        <CategorySection key={cat.id} label={cat.label} icon={GraduationCap} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#FF375F" />
                      ))}
                      {categorySearch && filteredUniversityCategories.length > 0 && !filteredUniversityCategories.some(cat => hasResults(cat.exams)) && (
                        <EmptyState search={categorySearch} fallbackText={t('noCategoriesAvailable')} />
                      )}
                    </TabsContent>

                    {/* Languages */}
                    <TabsContent value="languages" className="mt-0 space-y-8">
                      {LANGUAGE_CATEGORIES.map(cat => (
                        <CategorySection key={cat.id} label={cat.label} icon={Globe} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#00C7BE" />
                      ))}
                      {!LANGUAGE_CATEGORIES.some(cat => hasResults(cat.exams)) && <EmptyState search={categorySearch} fallbackText={t('noCategoriesAvailable')} />}
                    </TabsContent>

                    {/* Professional */}
                    <TabsContent value="professional" className="mt-0 space-y-8">
                      {PROFESSIONAL_CATEGORIES.map(cat => (
                        <CategorySection key={cat.id} label={cat.label} icon={Award} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#8E8E93" />
                      ))}
                      {!PROFESSIONAL_CATEGORIES.some(cat => hasResults(cat.exams)) && <EmptyState search={categorySearch} fallbackText={t('noCategoriesAvailable')} />}
                    </TabsContent>
                  </>
                ) : (
                  <div className="space-y-8">
                    {/* Global results */}
                    {GLOBAL_EXAMS_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection key={cat.id} label={cat.label} icon={BookOpen} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#0A84FF" />
                    ))}
                    {/* AP results */}
                    {AP_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection key={cat.id} label={cat.label} icon={Award} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#FF1493" />
                    ))}
                    {/* A Level results */}
                    {A_LEVEL_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection key={cat.id} label={cat.label} icon={GraduationCap} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#BF5AF2" />
                    ))}
                    {/* IB results */}
                    {IB_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection key={cat.id} label={cat.label} icon={BookOpen} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#32D74B" />
                    ))}
                    {/* IGCSE results */}
                    {IGCSE_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection key={cat.id} label={cat.label} icon={School} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#64D2FF" />
                    ))}
                    {/* National results */}
                    {nationalExams.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection key={cat.id} label={cat.label} icon={Flag} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#FF9F0A" />
                    ))}
                    {/* Universities results */}
                    {filteredUniversityCategories.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection key={cat.id} label={cat.label} icon={GraduationCap} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#FF375F" />
                    ))}
                    {/* Languages results */}
                    {LANGUAGE_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection key={cat.id} label={cat.label} icon={Globe} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#00C7BE" />
                    ))}
                    {/* Professional results */}
                    {PROFESSIONAL_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection key={cat.id} label={cat.label} icon={Award} exams={cat.exams} categorySearch={categorySearch} selectedCategories={selectedCategories} onToggleCategory={toggleCategory} color="#8E8E93" />
                    ))}

                    {/* Empty state if nothing matches across all tabs */}
                    {![GLOBAL_EXAMS_CATEGORIES, AP_CATEGORIES, A_LEVEL_CATEGORIES, IB_CATEGORIES, IGCSE_CATEGORIES, nationalExams, filteredUniversityCategories, LANGUAGE_CATEGORIES, PROFESSIONAL_CATEGORIES].some(group => group.some(cat => hasResults(cat.exams))) && (
                      <EmptyState search={categorySearch} fallbackText={t('noCategoriesAvailable')} />
                    )}
                  </div>
                )}
              </div>
            </Tabs>
          </div>
      </div>
    </div>
  )
}

// --- Main Page Component ---

export default function LandingPage() {
  const [modalType, setModalType] = useState<ModalType>(null)
  const [showCategories, setShowCategories] = useState(false)
  const [language, setLanguage] = useState<Language>('en')
  const [theme] = useState<ColorTheme>('emerald')
  const [mode] = useState<ThemeMode>('light')
  const [searchQuery, setSearchQuery] = useState('')
  const [tutorTotal, setTutorTotal] = useState<number | null>(null)
  const [courseTotal, setCourseTotal] = useState<number | null>(null)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const [howItWorksOpen, setHowItWorksOpen] = useState(false)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable motion props to prevent unnecessary re-renders / remounts
  const motionFadeIn = useMemo(() => ({ opacity: 1 }), [])

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current)
        scrollTimerRef.current = null
      }
    }
  }, [])

  const t = (key: string) => translations[key]?.[language] || translations[key]?.['en'] || key
  const formatCount = (value: number | null) =>
    typeof value === 'number' ? String(value).padStart(4, '0') : '0000'

  useEffect(() => {
    const controller = new AbortController()
    let finished = false

    const fetchWithTimeout = (url: string, options: RequestInit, timeoutMs = 5000) =>
      Promise.race([
        fetch(url, options),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        ),
      ])

    const loadCounts = async () => {
      console.log('[Landing] Loading counts...')
      const parseJsonSafe = async (res: Response) => {
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) return null
        return await res.json()
      }

      try {
        const [tutorsRes, coursesRes] = await Promise.all([
          fetchWithTimeout('/api/public/tutors?page=1&pageSize=1', { signal: controller.signal }),
          fetchWithTimeout('/api/public/courses?page=1&pageSize=1', { signal: controller.signal }),
        ])
        console.log('[Landing] Counts response:', { tutorsOk: tutorsRes.ok, coursesOk: coursesRes.ok })

        const [tutorsJson, coursesJson] = await Promise.all([
          tutorsRes.ok ? parseJsonSafe(tutorsRes) : null,
          coursesRes.ok ? parseJsonSafe(coursesRes) : null,
        ])

        if (!finished) {
          const nextTutorTotal =
            typeof tutorsJson?.pagination?.total === 'number' ? tutorsJson.pagination.total : null
          const nextCourseTotal =
            typeof coursesJson?.pagination?.total === 'number' ? coursesJson.pagination.total : null

          console.log('[Landing] Counts parsed:', { nextTutorTotal, nextCourseTotal })
          setTutorTotal(nextTutorTotal)
          setCourseTotal(nextCourseTotal)
        }
      } catch (err: any) {
        console.error('[Landing] Counts error:', err?.name, err?.message)
        if (!finished && err?.name !== 'AbortError') {
          setTutorTotal(null)
          setCourseTotal(null)
        }
      }
    }

    void loadCounts()
    return () => {
      finished = true
      controller.abort()
    }
  }, [])

  const scrollToSearchResults = () => {
    setTimeout(() => {
      document
        .getElementById('panel-2-search-results')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  return (
    <div className={`relative min-h-screen ${mode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
      <ComingSoonModal
        isOpen={modalType !== null}
        onClose={() => setModalType(null)}
        type={modalType}
        lang={language}
        theme={theme}
        mode={mode}
      />
      <CategorySearchModal
        isOpen={showCategories}
        onClose={() => setShowCategories(false)}
        onSelectCategory={categories => {
          setShowCategories(false)
          setSearchQuery(categories.join(' '))
          if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
          scrollTimerRef.current = setTimeout(() => {
            scrollTimerRef.current = null
            scrollToSearchResults()
          }, 300)
        }}
        lang={language}
        mode={mode}
      />
      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        lang={language}
        mode={mode}
      />
      <PrivacyPolicyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} mode={mode} />
      <TermsOfServiceModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} mode={mode} />

      {/* How It Works — Coming Soon Modal */}
      <AnimatePresence mode="wait">
        {howItWorksOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6"
            onClick={() => setHowItWorksOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-2 text-2xl font-bold text-foreground">Coming Soon</h2>
              <p className="mb-6 text-muted-foreground">
                We're working hard to bring you the full experience. Stay tuned!
              </p>
              <button
                onClick={() => setHowItWorksOpen(false)}
                className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video layer — isolated outside motion.main so Framer Motion never touches it */}
      <div className="absolute inset-x-0 top-0 h-screen bg-black">
        <video
          key="landing-bg-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          src="/landing-bg-video.mp4"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        {/* Gradient overlay for readability */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-900/25 via-blue-800/30 to-blue-950/45" />
      </div>

      <motion.main initial={motionFadeIn} animate={motionFadeIn} className="relative">
        <section className="relative min-h-screen overflow-hidden">
          <header className="relative z-10 flex items-center justify-between px-8 pt-8">
            <div className="flex items-center gap-3">
              <img src="/solocornlogo.png" alt="Solocorn" className="h-9 w-9" />
              <span className="text-[18px] font-semibold tracking-tight text-white">Solocorn</span>
            </div>
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => setModalType('register')}
                className="text-sm font-medium text-white"
              >
                JOIN
              </button>
              <SpecialAccessSection
                lang={language}
                triggerLabel="Sign In"
                triggerClassName="rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white shadow-md backdrop-blur-sm hover:bg-white/20 focus-visible:!shadow-none focus:outline-none"
                popoverPlacement="bottom"
              />
            </div>
          </header>

          <div className="relative z-10 flex min-h-[calc(100vh-160px)] flex-col items-center justify-center px-6 text-center">
            <h1 className="text-balance text-[32px] font-medium leading-tight text-white md:text-[36px]">
              Live AI-Augmented Tutoring Platform
            </h1>

            <div className="mt-10 w-full">
              <form
                onSubmit={e => {
                  e.preventDefault()
                  if (!searchQuery.trim()) return
                  scrollToSearchResults()
                  ;(e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur()
                }}
              >
                <div className="mx-auto flex h-14 w-[min(64vw,1040px)] max-w-full items-center rounded-full bg-white px-6">
                  <Search className="h-5 w-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search tutors, courses, categories..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="ml-4 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:outline-none focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCategories(true)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full"
                    aria-label="Browse categories"
                  >
                    <CategoryGridIcon className="h-[22px] w-[22px]" />
                  </button>
                </div>
              </form>
            </div>

            <button
              type="button"
              onClick={() => setHowItWorksOpen(true)}
              className="group relative mt-[22px] min-w-[140px] overflow-hidden rounded-full border border-white/20 bg-transparent px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-transparent focus-visible:!shadow-none focus:outline-none"
            >
              <span className="block opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                How It Works
              </span>
              <span className="absolute inset-0 flex items-center justify-center gap-0.5 transition-opacity duration-300 group-hover:opacity-0">
                <motion.span
                  className="inline-flex h-5 w-5"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  <Settings className="h-full w-full" />
                </motion.span>
                <motion.span
                  className="-mt-2 -ml-1 inline-flex h-3.5 w-3.5"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 1.33, repeat: Infinity, ease: 'linear' }}
                >
                  <Settings className="h-full w-full" />
                </motion.span>
              </span>
            </button>
          </div>

          {/* Bottom-right stats + countdown card */}
          <div className="absolute bottom-6 right-6 z-10">
            <div className="w-[300px] rounded-2xl border border-white/20 bg-white/10 px-6 py-5 shadow-lg sm:w-[360px] md:w-[400px] md:px-8 md:py-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/90">
                  <Users className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {typeof tutorTotal === 'number' ? tutorTotal : 5} Tutors
                  </span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <BookOpen className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {typeof courseTotal === 'number' ? courseTotal : 36} Courses
                  </span>
                </div>
              </div>
              <div className="mb-3">
                <CountdownTimer />
              </div>
              <div className="text-center text-sm font-medium text-white/70">Until Launch</div>
            </div>
          </div>
        </section>

        <Panel2SearchResults
          query={searchQuery}
          onClearAll={() => setSearchQuery('')}
        />

        <div id="how-it-works" />

        {/* Footer */}
        <footer
          className={`border-t px-6 py-20 ${mode === 'dark' ? 'border-white/5' : 'border-black/5'}`}
        >
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 md:flex-row">
            <div
              className={`text-2xl font-bold tracking-tighter ${mode === 'dark' ? '' : 'text-zinc-900'}`}
            >
              {t('footerBrand')}
            </div>
            <div
              className={`flex gap-8 text-sm ${mode === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}
            >
              <button
                onClick={() => setPrivacyOpen(true)}
                className={`hover:text-${theme}-400 cursor-pointer border-0 bg-transparent transition-colors`}
              >
                {t('privacyPolicy')}
              </button>
              <button
                onClick={() => setTermsOpen(true)}
                className={`hover:text-${theme}-400 cursor-pointer border-0 bg-transparent transition-colors`}
              >
                {t('termsOfService')}
              </button>
              <button
                onClick={() => setContactModalOpen(true)}
                className={`hover:text-${theme}-400 cursor-pointer border-0 bg-transparent transition-colors`}
              >
                {t('contact')}
              </button>
            </div>
            <div className={`text-sm ${mode === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>
              {t('allRightsReserved')}
            </div>
          </div>
        </footer>
      </motion.main>

      <style jsx global>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  )
}
