/**
 * Tutor teaching area categories - shared between signup and profile settings
 */

export interface ExamCategory {
  id: string
  label: string
  exams: string[]
}

export interface CountryData {
  code: string
  name: string
  nationalExams: ExamCategory[]
}

export interface Region {
  id: string
  name: string
  countries: CountryData[]
}

// National exams data by country
export const NATIONAL_EXAMS_DATA: Record<string, ExamCategory[]> = {
  HK: [
    {
      id: 'hkdse-s5',
      label: 'HKDSE Preparation (S5)',
      exams: [
        'S5 HKDSE Chinese Language Preparation',
        'S5 HKDSE English Language Preparation',
        'S5 HKDSE Mathematics Preparation',
        'S5 HKDSE Mathematics M1 Preparation',
        'S5 HKDSE Mathematics M2 Preparation',
        'S5 HKDSE Physics Preparation',
        'S5 HKDSE Chemistry Preparation',
        'S5 HKDSE Biology Preparation',
        'S5 HKDSE Combined Science Preparation',
      ],
    },
    {
      id: 'hkdse-s6',
      label: 'HKDSE Preparation (S6)',
      exams: [
        'S6 HKDSE Chinese Language Preparation',
        'S6 HKDSE English Language Preparation',
        'S6 HKDSE Mathematics Preparation',
        'S6 HKDSE Mathematics M1 Preparation',
        'S6 HKDSE Mathematics M2 Preparation',
        'S6 HKDSE Physics Preparation',
        'S6 HKDSE Chemistry Preparation',
        'S6 HKDSE Biology Preparation',
        'S6 HKDSE Combined Science Preparation',
      ],
    },
  ],
  KR: [
    {
      id: 'csat',
      label: 'CSAT Preparation (수능 Preparation)',
      exams: [
        'CSAT Korean Language Preparation',
        'CSAT English Preparation',
        'CSAT Mathematics Preparation',
        'CSAT Physics Preparation',
        'CSAT Chemistry Preparation',
        'CSAT Biology Preparation',
        'CSAT Earth Science Preparation',
      ],
    },
  ],
  SG: [
    {
      id: 'gce-o-level',
      label: 'GCE O-Level Preparation',
      exams: [
        'O-Level English Preparation',
        'O-Level Elementary Mathematics Preparation',
        'O-Level Additional Mathematics Preparation',
        'O-Level Physics Preparation',
        'O-Level Chemistry Preparation',
        'O-Level Biology Preparation',
        'O-Level Combined Science Preparation',
      ],
    },
    {
      id: 'gce-a-level',
      label: 'GCE A-Level Preparation',
      exams: [
        'A-Level General Paper Preparation',
        'A-Level Mathematics Preparation',
        'A-Level Physics Preparation',
        'A-Level Chemistry Preparation',
        'A-Level Biology Preparation',
      ],
    },
  ],
  JP: [
    {
      id: 'university-entrance',
      label: 'University Entrance Examination Preparation',
      exams: [
        'Japanese University Entrance Japanese Language',
        'Japanese University Entrance English',
        'Japanese University Entrance Mathematics',
        'Japanese University Entrance Physics',
        'Japanese University Entrance Chemistry',
        'Japanese University Entrance Biology',
        'Japanese University Entrance Earth Science',
      ],
    },
  ],
  TH: [
    {
      id: 'university-admission',
      label: 'University Admission Examination',
      exams: [
        'Thai University Admission Thai Language',
        'Thai University Admission English',
        'Thai University Admission Mathematics',
        'Thai University Admission Physics',
        'Thai University Admission Chemistry',
        'Thai University Admission Biology',
        'Thai University Admission Earth & Space Science',
      ],
    },
  ],
  IN: [
    {
      id: 'jee',
      label: 'Engineering Entrance (JEE)',
      exams: [
        'JEE Main Preparation — Mathematics',
        'JEE Main Preparation — Physics',
        'JEE Main Preparation — Chemistry',
        'JEE Advanced Preparation — Mathematics',
        'JEE Advanced Preparation — Physics',
        'JEE Advanced Preparation — Chemistry',
      ],
    },
    {
      id: 'neet',
      label: 'Medical Entrance (NEET)',
      exams: [
        'NEET Preparation — Physics',
        'NEET Preparation — Chemistry',
        'NEET Preparation — Biology',
      ],
    },
  ],
  VN: [
    {
      id: 'national-exam',
      label: 'National Examination Preparation',
      exams: [
        'Vietnam National Exam — Vietnamese Language',
        'Vietnam National Exam — English',
        'Vietnam National Exam — Mathematics',
        'Vietnam National Exam — Physics',
        'Vietnam National Exam — Chemistry',
        'Vietnam National Exam — Biology',
      ],
    },
  ],
  TW: [
    {
      id: 'university-entrance',
      label: 'University Entrance Examination',
      exams: [
        'Taiwan University Entrance Chinese',
        'Taiwan University Entrance English',
        'Taiwan University Entrance Mathematics',
        'Taiwan University Entrance Physics',
        'Taiwan University Entrance Chemistry',
        'Taiwan University Entrance Biology',
      ],
    },
  ],
  MY: [
    {
      id: 'spm',
      label: 'SPM Examination',
      exams: [
        'SPM Malay',
        'SPM English',
        'SPM Mathematics',
        'SPM Physics',
        'SPM Chemistry',
        'SPM Biology',
      ],
    },
  ],
  ID: [
    {
      id: 'university-admission',
      label: 'University Admission',
      exams: [
        'University Admission Indonesian',
        'University Admission English',
        'University Admission Mathematics',
        'University Admission Physics',
        'University Admission Chemistry',
        'University Admission Biology',
      ],
    },
  ],
  IL: [
    {
      id: 'bagrut',
      label: 'Bagrut',
      exams: [
        'Bagrut Hebrew',
        'Bagrut English',
        'Bagrut Mathematics',
        'Bagrut Physics',
        'Bagrut Chemistry',
        'Bagrut Biology',
      ],
    },
  ],
  SA: [
    {
      id: 'university-admission',
      label: 'University Admission',
      exams: [
        'University Admission Arabic',
        'University Admission English',
        'University Admission Mathematics',
        'University Admission Physics',
        'University Admission Chemistry',
        'University Admission Biology',
      ],
    },
  ],
  QA: [
    {
      id: 'university-admission',
      label: 'University Admission',
      exams: [
        'University Admission Arabic',
        'University Admission English',
        'University Admission Mathematics',
        'University Admission Physics',
        'University Admission Chemistry',
        'University Admission Biology',
      ],
    },
  ],
  KW: [
    {
      id: 'university-admission',
      label: 'University Admission',
      exams: [
        'University Admission Arabic',
        'University Admission English',
        'University Admission Mathematics',
        'University Admission Physics',
        'University Admission Chemistry',
        'University Admission Biology',
      ],
    },
  ],
  OM: [
    {
      id: 'university-admission',
      label: 'University Admission',
      exams: [
        'University Admission Arabic',
        'University Admission English',
        'University Admission Mathematics',
        'University Admission Physics',
        'University Admission Chemistry',
        'University Admission Biology',
      ],
    },
  ],
  GB: [
    {
      id: 'gcse',
      label: 'GCSE',
      exams: [
        'GCSE English Language',
        'GCSE English Literature',
        'GCSE Mathematics',
        'GCSE Biology',
        'GCSE Chemistry',
        'GCSE Physics',
        'GCSE Combined Science',
      ],
    },
    {
      id: 'a-level-uk',
      label: 'A Level (UK)',
      exams: [
        'A Level English',
        'A Level Mathematics',
        'A Level Biology',
        'A Level Chemistry',
        'A Level Physics',
      ],
    },
  ],
  DE: [
    {
      id: 'abitur',
      label: 'Abitur',
      exams: [
        'Abitur German',
        'Abitur English',
        'Abitur Mathematics',
        'Abitur Biology',
        'Abitur Chemistry',
        'Abitur Physics',
      ],
    },
  ],
  FR: [
    {
      id: 'baccalaureat',
      label: 'Baccalauréat',
      exams: [
        'Baccalauréat French',
        'Baccalauréat English',
        'Baccalauréat Mathematics',
        'Baccalauréat Biology',
        'Baccalauréat Chemistry',
        'Baccalauréat Physics',
      ],
    },
  ],
  NL: [
    {
      id: 'eindexamen',
      label: 'Eindexamen',
      exams: [
        'Eindexamen Dutch',
        'Eindexamen English',
        'Eindexamen Mathematics',
        'Eindexamen Biology',
        'Eindexamen Chemistry',
        'Eindexamen Physics',
      ],
    },
  ],
  BE: [
    {
      id: 'cess',
      label: 'CESS / Diploma Secundair Onderwijs',
      exams: [
        'CESS / Diploma Secundair — Language',
        'CESS / Diploma Secundair — English',
        'CESS / Diploma Secundair — Mathematics',
        'CESS / Diploma Secundair — Biology',
        'CESS / Diploma Secundair — Chemistry',
        'CESS / Diploma Secundair — Physics',
      ],
    },
  ],
  CH: [
    {
      id: 'matura',
      label: 'Matura',
      exams: [
        'Matura Language',
        'Matura English',
        'Matura Mathematics',
        'Matura Biology',
        'Matura Chemistry',
        'Matura Physics',
      ],
    },
  ],
  IT: [
    {
      id: 'esame-di-stato',
      label: 'Esame di Stato',
      exams: [
        'Esame di Stato Italian',
        'Esame di Stato English',
        'Esame di Stato Mathematics',
        'Esame di Stato Biology',
        'Esame di Stato Chemistry',
        'Esame di Stato Physics',
      ],
    },
  ],
  ES: [
    {
      id: 'ebau',
      label: 'EBAU (Selectividad)',
      exams: [
        'EBAU Spanish',
        'EBAU English',
        'EBAU Mathematics',
        'EBAU Biology',
        'EBAU Chemistry',
        'EBAU Physics',
      ],
    },
  ],
  IE: [
    {
      id: 'leaving-cert',
      label: 'Leaving Certificate',
      exams: [
        'Leaving Certificate English',
        'Leaving Certificate Irish',
        'Leaving Certificate Mathematics',
        'Leaving Certificate Biology',
        'Leaving Certificate Chemistry',
        'Leaving Certificate Physics',
      ],
    },
  ],
  PT: [
    {
      id: 'enes',
      label: 'ENES (Exames Nacionais do Ensino Secundário)',
      exams: [
        'ENES Portuguese',
        'ENES English',
        'ENES Mathematics',
        'ENES Biology & Geology',
        'ENES Physics & Chemistry',
        'ENES History',
      ],
    },
  ],
  AT: [
    {
      id: 'matura',
      label: 'Matura',
      exams: [
        'Matura German',
        'Matura English',
        'Matura Mathematics',
        'Matura Biology',
        'Matura Chemistry',
        'Matura Physics',
      ],
    },
  ],
  PL: [
    {
      id: 'matura',
      label: 'Matura',
      exams: [
        'Matura Polish',
        'Matura English',
        'Matura Mathematics',
        'Matura Biology',
        'Matura Chemistry',
        'Matura Physics',
      ],
    },
  ],
  CZ: [
    {
      id: 'maturita',
      label: 'Maturita',
      exams: [
        'Maturita Czech',
        'Maturita English',
        'Maturita Mathematics',
        'Maturita Biology',
        'Maturita Chemistry',
        'Maturita Physics',
      ],
    },
  ],
  HU: [
    {
      id: 'erettsegi',
      label: 'Érettségi (Matura)',
      exams: [
        'Érettségi Hungarian Literature & Grammar',
        'Érettségi English',
        'Érettségi Mathematics',
        'Érettségi Biology',
        'Érettségi Chemistry',
        'Érettségi Physics',
      ],
    },
  ],
  RO: [
    {
      id: 'baccalaureate',
      label: 'Baccalaureate',
      exams: [
        'Baccalaureate Romanian',
        'Baccalaureate English',
        'Baccalaureate Mathematics',
        'Baccalaureate Biology',
        'Baccalaureate Chemistry',
        'Baccalaureate Physics',
      ],
    },
  ],
  GR: [
    {
      id: 'panhellenic',
      label: 'Panhellenic Exams',
      exams: [
        'Panhellenic Greek',
        'Panhellenic English',
        'Panhellenic Mathematics',
        'Panhellenic Biology',
        'Panhellenic Chemistry',
        'Panhellenic Physics',
      ],
    },
  ],
  TR: [
    {
      id: 'yks',
      label: 'YKS',
      exams: [
        'YKS Turkish',
        'YKS English',
        'YKS Mathematics',
        'YKS Biology',
        'YKS Chemistry',
        'YKS Physics',
      ],
    },
  ],
  AU: [
    {
      id: 'senior-secondary',
      label: 'Senior Secondary',
      exams: [
        'Senior Secondary English',
        'Senior Secondary Mathematics',
        'Senior Secondary Biology',
        'Senior Secondary Chemistry',
        'Senior Secondary Physics',
      ],
    },
  ],
  NZ: [
    {
      id: 'ncea',
      label: 'NCEA',
      exams: ['NCEA English', 'NCEA Mathematics', 'NCEA Biology', 'NCEA Chemistry', 'NCEA Physics'],
    },
  ],
  US: [
    {
      id: 'sat-act',
      label: 'SAT/ACT',
      exams: ['SAT English', 'SAT Mathematics', 'ACT English', 'ACT Mathematics', 'ACT Science'],
    },
    {
      id: 'ap',
      label: 'AP Courses',
      exams: [
        'AP English Language',
        'AP English Literature',
        'AP Calculus AB',
        'AP Calculus BC',
        'AP Biology',
        'AP Chemistry',
        'AP Physics 1',
        'AP Physics 2',
        'AP Physics C',
      ],
    },
  ],
  MX: [
    {
      id: 'university-admission',
      label: 'University Admission',
      exams: [
        'Mexico University Admission Examination',
        'EXANI-II (CENEVAL) Preparation',
        'EXANI-II Verbal Reasoning',
        'EXANI-II Mathematical Reasoning',
        'EXANI-II Natural Sciences',
      ],
    },
  ],
  CR: [
    {
      id: 'university-admission',
      label: 'University Admission',
      exams: [
        'UCR PAA Preparation — Verbal Reasoning',
        'UCR PAA Preparation — Mathematical Reasoning',
        'TEC Admission Exam Preparation — Verbal Reasoning',
        'TEC Admission Exam Preparation — Mathematical Reasoning',
      ],
    },
  ],
  PA: [
    {
      id: 'university-admission',
      label: 'University Admission',
      exams: [
        'University of Panama Admission Exam Preparation — Spanish Reasoning',
        'University of Panama Admission Exam Preparation — Mathematical Reasoning',
        'Technological University of Panama Admission Preparation — Mathematics',
        'Technological University of Panama Admission Preparation — Academic Aptitude',
      ],
    },
  ],
  DO: [
    {
      id: 'national-exam',
      label: 'National Examination',
      exams: [
        'Pruebas Nacionales — Spanish',
        'Pruebas Nacionales — Mathematics',
        'Pruebas Nacionales — Natural Sciences',
        'Pruebas Nacionales — Social Sciences',
      ],
    },
  ],
  BR: [
    {
      id: 'enem',
      label: 'ENEM',
      exams: [
        'ENEM Portuguese & Communication',
        'ENEM Essay Writing (Redação)',
        'ENEM Mathematics',
        'ENEM Natural Sciences (Biology, Chemistry, Physics)',
      ],
    },
  ],
  CN: [
    {
      id: 'gaokao',
      label: 'Gaokao (高考)',
      exams: [
        'Gaokao Chinese',
        'Gaokao English',
        'Gaokao Mathematics',
        'Gaokao Physics',
        'Gaokao Chemistry',
        'Gaokao Biology',
      ],
    },
  ],
  AE: [
    {
      id: 'tawjihiya',
      label: 'Tawjihiya / General Secondary Education Certificate',
      exams: [
        'Tawjihiya Arabic',
        'Tawjihiya English',
        'Tawjihiya Mathematics',
        'Tawjihiya Physics',
        'Tawjihiya Chemistry',
        'Tawjihiya Biology',
      ],
    },
  ],
  ZA: [
    {
      id: 'nsc',
      label: 'National Senior Certificate (Matric)',
      exams: [
        'Matric English Home Language',
        'Matric Afrikaans First Additional Language',
        'Matric Mathematics',
        'Matric Mathematical Literacy',
        'Matric Physical Sciences',
        'Matric Life Sciences',
      ],
    },
  ],
  EG: [
    {
      id: 'thanaweya-amma',
      label: 'Thanaweya Amma (General Secondary Education Certificate)',
      exams: [
        'Thanaweya Amma Arabic',
        'Thanaweya Amma English',
        'Thanaweya Amma Mathematics',
        'Thanaweya Amma Physics',
        'Thanaweya Amma Chemistry',
        'Thanaweya Amma Biology',
      ],
    },
  ],
  NG: [
    {
      id: 'wassce',
      label: 'WASSCE / NECO SSCE',
      exams: [
        'WASSCE English Language',
        'WASSCE Mathematics',
        'WASSCE Biology',
        'WASSCE Chemistry',
        'WASSCE Physics',
        'NECO SSCE Core Subjects',
      ],
    },
  ],
  KE: [
    {
      id: 'kcse',
      label: 'KCSE (Kenya Certificate of Secondary Education)',
      exams: [
        'KCSE English',
        'KCSE Kiswahili',
        'KCSE Mathematics',
        'KCSE Biology',
        'KCSE Chemistry',
        'KCSE Physics',
      ],
    },
  ],
  GH: [
    {
      id: 'wassce',
      label: 'WASSCE (West African Senior School Certificate Examination)',
      exams: [
        'WASSCE English Language',
        'WASSCE Mathematics',
        'WASSCE Integrated Science',
        'WASSCE Social Studies',
        'WASSCE Biology',
        'WASSCE Chemistry',
        'WASSCE Physics',
      ],
    },
  ],
  MA: [
    {
      id: 'baccalaureat',
      label: 'Baccalauréat',
      exams: [
        'Baccalauréat Arabic',
        'Baccalauréat French',
        'Baccalauréat Mathematics',
        'Baccalauréat Physics',
        'Baccalauréat Chemistry',
        'Baccalauréat Life & Earth Sciences',
      ],
    },
  ],
  TN: [
    {
      id: 'baccalaureat',
      label: 'Baccalauréat',
      exams: [
        'Baccalauréat Arabic',
        'Baccalauréat French',
        'Baccalauréat Mathematics',
        'Baccalauréat Physics',
        'Baccalauréat Chemistry',
        'Baccalauréat Life & Earth Sciences',
      ],
    },
  ],
  BW: [
    {
      id: 'bgcse',
      label: 'BGCSE (Botswana General Certificate of Secondary Education)',
      exams: [
        'BGCSE English Language',
        'BGCSE Setswana',
        'BGCSE Mathematics',
        'BGCSE Biology',
        'BGCSE Chemistry',
        'BGCSE Physics',
      ],
    },
  ],
  NA: [
    {
      id: 'nssc',
      label: 'NSSC (Namibia Senior Secondary Certificate)',
      exams: [
        'NSSC English Second Language',
        'NSSC Afrikaans Second Language',
        'NSSC Mathematics',
        'NSSC Biology',
        'NSSC Chemistry',
        'NSSC Physics',
      ],
    },
  ],
  PH: [
    {
      id: 'upcat',
      label: 'UPCAT / University Admission',
      exams: [
        'UPCAT Language Proficiency',
        'UPCAT Science',
        'UPCAT Mathematics',
        'UPCAT Reading Comprehension',
      ],
    },
  ],
  CL: [
    {
      id: 'paes',
      label: 'PAES (Prueba de Acceso a la Educación Superior)',
      exams: [
        'PAES Mathematics',
        'PAES Language & Communication',
        'PAES History & Social Sciences',
        'PAES Science',
      ],
    },
  ],
  PE: [
    {
      id: 'university-admission',
      label: 'University Admission Exam',
      exams: [
        'University Admission Mathematics',
        'University Admission Communication',
        'University Admission Science',
        'University Admission Humanities',
      ],
    },
  ],
  CO: [
    {
      id: 'icfes',
      label: 'ICFES Saber 11',
      exams: [
        'Saber 11 Critical Reading',
        'Saber 11 Mathematics',
        'Saber 11 Natural Sciences',
        'Saber 11 Social Sciences',
        'Saber 11 English',
      ],
    },
  ],
  AR: [
    {
      id: 'university-admission',
      label: 'University Admission Exam',
      exams: [
        'University Admission Mathematics',
        'University Admission Language',
        'University Admission Biology',
        'University Admission Chemistry',
        'University Admission Physics',
      ],
    },
  ],
  UY: [
    {
      id: 'university-admission',
      label: 'University Admission Exam',
      exams: [
        'University Admission Mathematics',
        'University Admission Language',
        'University Admission Science',
      ],
    },
  ],
  EC: [
    {
      id: 'ser-bachiller',
      label: 'Ser Bachiller / ENES',
      exams: [
        'Ser Bachiller Mathematics',
        'Ser Bachiller Language & Literature',
        'Ser Bachiller Natural Sciences',
        'Ser Bachiller Social Sciences',
      ],
    },
  ],
}

export const REGIONS: Region[] = [
  {
    id: 'global',
    name: 'Global',
    countries: [{ code: 'GL', name: 'Global', nationalExams: [] }],
  },
  {
    id: 'asia',
    name: 'Asia',
    countries: [
      { code: 'HK', name: 'Hong Kong', nationalExams: NATIONAL_EXAMS_DATA['HK'] || [] },
      { code: 'KR', name: 'Korea', nationalExams: NATIONAL_EXAMS_DATA['KR'] || [] },
      { code: 'SG', name: 'Singapore', nationalExams: NATIONAL_EXAMS_DATA['SG'] || [] },
      { code: 'JP', name: 'Japan', nationalExams: NATIONAL_EXAMS_DATA['JP'] || [] },
      { code: 'TH', name: 'Thailand', nationalExams: NATIONAL_EXAMS_DATA['TH'] || [] },
      { code: 'IN', name: 'India', nationalExams: NATIONAL_EXAMS_DATA['IN'] || [] },
      { code: 'VN', name: 'Vietnam', nationalExams: NATIONAL_EXAMS_DATA['VN'] || [] },
      { code: 'TW', name: 'Taiwan', nationalExams: NATIONAL_EXAMS_DATA['TW'] || [] },
      { code: 'MY', name: 'Malaysia', nationalExams: NATIONAL_EXAMS_DATA['MY'] || [] },
      { code: 'ID', name: 'Indonesia', nationalExams: NATIONAL_EXAMS_DATA['ID'] || [] },
      { code: 'PH', name: 'Philippines', nationalExams: [] },
      { code: 'IL', name: 'Israel', nationalExams: NATIONAL_EXAMS_DATA['IL'] || [] },
      { code: 'CN', name: 'China', nationalExams: NATIONAL_EXAMS_DATA['CN'] || [] },
    ],
  },
  {
    id: 'middle-east',
    name: 'Middle East',
    countries: [
      { code: 'AE', name: 'United Arab Emirates', nationalExams: NATIONAL_EXAMS_DATA['AE'] || [] },
      { code: 'SA', name: 'Saudi Arabia', nationalExams: NATIONAL_EXAMS_DATA['SA'] || [] },
      { code: 'QA', name: 'Qatar', nationalExams: NATIONAL_EXAMS_DATA['QA'] || [] },
      { code: 'KW', name: 'Kuwait', nationalExams: NATIONAL_EXAMS_DATA['KW'] || [] },
      { code: 'OM', name: 'Oman', nationalExams: NATIONAL_EXAMS_DATA['OM'] || [] },
    ],
  },
  {
    id: 'europe',
    name: 'Europe',
    countries: [
      { code: 'GB', name: 'United Kingdom', nationalExams: NATIONAL_EXAMS_DATA['GB'] || [] },
      { code: 'DE', name: 'Germany', nationalExams: NATIONAL_EXAMS_DATA['DE'] || [] },
      { code: 'FR', name: 'France', nationalExams: NATIONAL_EXAMS_DATA['FR'] || [] },
      { code: 'NL', name: 'Netherlands', nationalExams: NATIONAL_EXAMS_DATA['NL'] || [] },
      { code: 'BE', name: 'Belgium', nationalExams: NATIONAL_EXAMS_DATA['BE'] || [] },
      { code: 'CH', name: 'Switzerland', nationalExams: NATIONAL_EXAMS_DATA['CH'] || [] },
      { code: 'IT', name: 'Italy', nationalExams: NATIONAL_EXAMS_DATA['IT'] || [] },
      { code: 'ES', name: 'Spain', nationalExams: NATIONAL_EXAMS_DATA['ES'] || [] },
      { code: 'IE', name: 'Ireland', nationalExams: NATIONAL_EXAMS_DATA['IE'] || [] },
      { code: 'PT', name: 'Portugal', nationalExams: NATIONAL_EXAMS_DATA['PT'] || [] },
      { code: 'AT', name: 'Austria', nationalExams: NATIONAL_EXAMS_DATA['AT'] || [] },
      { code: 'PL', name: 'Poland', nationalExams: NATIONAL_EXAMS_DATA['PL'] || [] },
      { code: 'CZ', name: 'Czech Republic', nationalExams: NATIONAL_EXAMS_DATA['CZ'] || [] },
      { code: 'HU', name: 'Hungary', nationalExams: NATIONAL_EXAMS_DATA['HU'] || [] },
      { code: 'RO', name: 'Romania', nationalExams: NATIONAL_EXAMS_DATA['RO'] || [] },
      { code: 'GR', name: 'Greece', nationalExams: NATIONAL_EXAMS_DATA['GR'] || [] },
      { code: 'TR', name: 'Turkey', nationalExams: NATIONAL_EXAMS_DATA['TR'] || [] },
    ],
  },
  {
    id: 'oceania',
    name: 'Oceania',
    countries: [
      { code: 'AU', name: 'Australia', nationalExams: NATIONAL_EXAMS_DATA['AU'] || [] },
      { code: 'NZ', name: 'New Zealand', nationalExams: NATIONAL_EXAMS_DATA['NZ'] || [] },
    ],
  },
  {
    id: 'north-america',
    name: 'North America',
    countries: [
      { code: 'US', name: 'United States', nationalExams: NATIONAL_EXAMS_DATA['US'] || [] },
      { code: 'CA', name: 'Canada', nationalExams: NATIONAL_EXAMS_DATA['CA'] || [] },
      { code: 'MX', name: 'Mexico', nationalExams: NATIONAL_EXAMS_DATA['MX'] || [] },
    ],
  },
  {
    id: 'south-america',
    name: 'South America',
    countries: [
      { code: 'CL', name: 'Chile', nationalExams: NATIONAL_EXAMS_DATA['CL'] || [] },
      { code: 'PE', name: 'Peru', nationalExams: NATIONAL_EXAMS_DATA['PE'] || [] },
      { code: 'CO', name: 'Colombia', nationalExams: NATIONAL_EXAMS_DATA['CO'] || [] },
      { code: 'AR', name: 'Argentina', nationalExams: NATIONAL_EXAMS_DATA['AR'] || [] },
      { code: 'UY', name: 'Uruguay', nationalExams: NATIONAL_EXAMS_DATA['UY'] || [] },
      { code: 'EC', name: 'Ecuador', nationalExams: NATIONAL_EXAMS_DATA['EC'] || [] },
    ],
  },
  {
    id: 'africa',
    name: 'Africa',
    countries: [
      { code: 'NG', name: 'Nigeria', nationalExams: NATIONAL_EXAMS_DATA['NG'] || [] },
      { code: 'KE', name: 'Kenya', nationalExams: NATIONAL_EXAMS_DATA['KE'] || [] },
      { code: 'GH', name: 'Ghana', nationalExams: NATIONAL_EXAMS_DATA['GH'] || [] },
      { code: 'EG', name: 'Egypt', nationalExams: NATIONAL_EXAMS_DATA['EG'] || [] },
      { code: 'MA', name: 'Morocco', nationalExams: NATIONAL_EXAMS_DATA['MA'] || [] },
      { code: 'TN', name: 'Tunisia', nationalExams: NATIONAL_EXAMS_DATA['TN'] || [] },
      { code: 'BW', name: 'Botswana', nationalExams: NATIONAL_EXAMS_DATA['BW'] || [] },
      { code: 'NA', name: 'Namibia', nationalExams: NATIONAL_EXAMS_DATA['NA'] || [] },
      { code: 'ZA', name: 'South Africa', nationalExams: NATIONAL_EXAMS_DATA['ZA'] || [] },
    ],
  },
]

// Generate ALL_COUNTRIES from REGIONS for the country of residence selector
export const ALL_COUNTRIES = REGIONS.flatMap(region =>
  region.countries.map(country => ({
    code: country.code,
    name: country.name,
  }))
).sort((a, b) => a.name.localeCompare(b.name))

// Global Exams Categories
export const GLOBAL_EXAMS_CATEGORIES: ExamCategory[] = [
  { id: 'admission-exams', label: 'Admission Exams', exams: ['SAT', 'ACT'] },
  {
    id: 'english-proficiency',
    label: 'English Proficiency',
    exams: [
      'IELTS Academic',
      'IELTS General',
      'TOEFL iBT',
      'PTE Academic',
      'Duolingo English Test',
      'CPE',
      'CAE',
      'Cambridge B2',
      'International ESOL',
      'Oxford Test of English',
      'iTEP Academic',
      'TOEIC',
      'MET',
      'EIKEN',
    ],
  },
  {
    id: 'postgraduate-exams',
    label: 'Postgraduate Exams',
    exams: ['GRE', 'GMAT', 'LSAT', 'MCAT', 'UCAT'],
  },
]

// AP Categories
export const AP_CATEGORIES: ExamCategory[] = [
  {
    id: 'ap-stem',
    label: 'AP - STEM',
    exams: [
      'AP Calculus AB',
      'AP Calculus BC',
      'AP Statistics',
      'AP Biology',
      'AP Chemistry',
      'AP Physics 1',
      'AP Physics 2',
      'AP Physics C: Mechanics',
      'AP Physics C: Electricity and Magnetism',
      'AP Environmental Science',
      'AP Computer Science A',
      'AP Computer Science Principles',
    ],
  },
  {
    id: 'ap-humanities',
    label: 'AP - Humanities',
    exams: [
      'AP English & Composition',
      'AP Literature & Composition',
      'AP United States History',
      'AP World History',
      'AP European History',
      'AP United States Government and Politics',
      'AP Comparative Government and Politics',
      'AP Macroeconomics',
      'AP Microeconomics',
      'AP Psychology',
      'AP Human Geography',
    ],
  },
  {
    id: 'ap-languages',
    label: 'AP - Languages',
    exams: [
      'AP Chinese Language and Culture',
      'AP French Language and Culture',
      'AP German Language and Culture',
      'AP Italian Language and Culture',
      'AP Japanese Language and Culture',
      'AP Latin',
      'AP Spanish Language and Culture',
      'AP Spanish Literature and Culture',
    ],
  },
  {
    id: 'ap-art',
    label: 'AP - Art',
    exams: [
      'AP Art History',
      'AP Music Theory',
      'AP Studio Art: 2-D Art and Design',
      'AP Studio Art: 3-D Art and Design',
      'AP Drawing',
    ],
  },
]

// A Level Categories
export const A_LEVEL_CATEGORIES: ExamCategory[] = [
  {
    id: 'as-courses',
    label: 'AS Level Courses',
    exams: [
      'AS Level Mathematics',
      'AS Level Further Mathematics',
      'AS Level Physics',
      'AS Level Chemistry',
      'AS Level Biology',
      'AS Level Computer Science',
      'AS Level Information Technology',
      'AS Level Economics',
      'AS Level Business',
      'AS Level Accounting',
      'AS Level Psychology',
      'AS Level Sociology',
      'AS Level History',
      'AS Level Geography',
      'AS Level English Language',
      'AS Level English Literature',
      'AS Level Global Perspectives & Research',
      'AS Level Art and Design',
      'AS Level Media Studies',
    ],
  },
  {
    id: 'a-level-courses',
    label: 'A Level Courses',
    exams: [
      'A Level Mathematics',
      'A Level Further Mathematics',
      'A Level Physics',
      'A Level Chemistry',
      'A Level Biology',
      'A Level Computer Science',
      'A Level Information Technology',
      'A Level Economics',
      'A Level Business',
      'A Level Accounting',
      'A Level Psychology',
      'A Level Sociology',
      'A Level History',
      'A Level Geography',
      'A Level English Language',
      'A Level English Literature',
      'A Level Global Perspectives & Research',
      'A Level Art and Design',
      'A Level Media Studies',
    ],
  },
]

// IB Categories
export const IB_CATEGORIES: ExamCategory[] = [
  {
    id: 'ib-courses',
    label: 'IB Courses',
    exams: [
      'IB Mathematics: Analysis and Approaches',
      'IB Mathematics: Applications and Interpretation',
      'IB Physics',
      'IB Chemistry',
      'IB Biology',
      'IB Computer Science',
      'IB Economics',
      'IB Business Management',
      'IB Psychology',
      'IB History',
      'IB Geography',
      'IB English A: Language and Literature',
      'IB English A: Literature',
      'IB Language B Courses',
      'IB Visual Arts',
      'IB Theory of Knowledge (TOK)',
      'IB Extended Essay (EE)',
    ],
  },
]

// IGCSE Categories
export const IGCSE_CATEGORIES: ExamCategory[] = [
  {
    id: 'igcse-mathematics',
    label: 'IGCSE Mathematics',
    exams: ['IGCSE Mathematics', 'IGCSE Additional Mathematics', 'IGCSE International Mathematics'],
  },
  {
    id: 'igcse-sciences',
    label: 'IGCSE Sciences',
    exams: [
      'IGCSE Physics',
      'IGCSE Chemistry',
      'IGCSE Biology',
      'IGCSE Combined Science',
      'IGCSE Coordinated Sciences',
      'IGCSE Environmental Management',
    ],
  },
  {
    id: 'igcse-english',
    label: 'IGCSE English',
    exams: [
      'IGCSE English Language',
      'IGCSE English Literature',
      'IGCSE English as a Second Language',
    ],
  },
  {
    id: 'igcse-humanities',
    label: 'IGCSE Humanities',
    exams: [
      'IGCSE History',
      'IGCSE Geography',
      'IGCSE Economics',
      'IGCSE Business Studies',
      'IGCSE Accounting',
      'IGCSE Sociology',
      'IGCSE Global Perspectives',
    ],
  },
  {
    id: 'igcse-languages',
    label: 'IGCSE Languages',
    exams: [
      'IGCSE French',
      'IGCSE Spanish',
      'IGCSE German',
      'IGCSE Chinese',
      'IGCSE Arabic',
      'IGCSE Hindi',
    ],
  },
  {
    id: 'igcse-arts',
    label: 'IGCSE Arts',
    exams: [
      'IGCSE Art & Design',
      'IGCSE Music',
      'IGCSE Drama',
      'IGCSE Physical Education',
      'IGCSE Travel & Tourism',
    ],
  },
  {
    id: 'igcse-technical',
    label: 'IGCSE Technical',
    exams: [
      'IGCSE Computer Science',
      'IGCSE Information & Communication Technology',
      'IGCSE Design & Technology',
    ],
  },
]

// Re-export specialty categories from the centralized file
export {
  UNIVERSITY_CATEGORIES,
  LANGUAGE_CATEGORIES,
  PROFESSIONAL_CATEGORIES,
  SPECIALTY_CATEGORIES,
  UNIVERSITIES_BY_COUNTRY_CODE,
  getUniversityRegionId,
} from '../tutoring/specialty-categories'
