export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type SupportedLanguage = 'en' | 'ml' | 'hi' | 'ta'
export type SupportedTheme = 'Light' | 'Dark (Preview)' | 'System'
export type QuizLength = '5 questions' | '10 questions' | '15 questions' | '20 questions'
export type ExplanationStyle = 'Simple' | 'Detailed' | 'Exam-focused'
export type ReadSpeed = '0.75x' | '1.0x' | '1.25x' | '1.5x'
export type MaterialType = 'PDF' | 'TXT' | 'DOC' | 'DOCX'
export type MaterialStatus = 'Ready' | 'Processing' | 'Failed'
export type TutorRole = 'user' | 'ai'
export type ScanQueryMode = 'notes' | 'general'

export interface NoteSection {
  id: string
  title: string
  content: string
  examTip?: string
  bullets?: string[]
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          user_id: string
          language: SupportedLanguage
          theme: SupportedTheme
          quiz_length: QuizLength
          explanation_style: ExplanationStyle
          read_speed: ReadSpeed
          daily_reminder: boolean
          spaced_repetition: boolean
          weekly_email: boolean
          source_references: boolean
          preserve_quiz: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          language?: SupportedLanguage
          theme?: SupportedTheme
          quiz_length?: QuizLength
          explanation_style?: ExplanationStyle
          read_speed?: ReadSpeed
          daily_reminder?: boolean
          spaced_repetition?: boolean
          weekly_email?: boolean
          source_references?: boolean
          preserve_quiz?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          language?: SupportedLanguage
          theme?: SupportedTheme
          quiz_length?: QuizLength
          explanation_style?: ExplanationStyle
          read_speed?: ReadSpeed
          daily_reminder?: boolean
          spaced_repetition?: boolean
          weekly_email?: boolean
          source_references?: boolean
          preserve_quiz?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          id: string
          user_id: string
          name: string
          type: MaterialType
          size_bytes: number
          size_display: string | null
          storage_path: string | null
          status: MaterialStatus
          progress: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: MaterialType
          size_bytes?: number
          size_display?: string | null
          storage_path?: string | null
          status?: MaterialStatus
          progress?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: MaterialType
          size_bytes?: number
          size_display?: string | null
          storage_path?: string | null
          status?: MaterialStatus
          progress?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      study_notes: {
        Row: {
          id: string
          user_id: string
          material_id: string | null
          title: string
          summary: string | null
          sections: Json
          is_bookmarked: boolean
          language: SupportedLanguage
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          material_id?: string | null
          title: string
          summary?: string | null
          sections?: Json
          is_bookmarked?: boolean
          language?: SupportedLanguage
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          material_id?: string | null
          title?: string
          summary?: string | null
          sections?: Json
          is_bookmarked?: boolean
          language?: SupportedLanguage
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_study_notes_material_user'
            columns: ['material_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'materials'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      quiz_attempts: {
        Row: {
          id: string
          user_id: string
          material_id: string | null
          topic: string
          score: number
          total_questions: number
          percentage: number
          answers: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          material_id?: string | null
          topic: string
          score?: number
          total_questions?: number
          percentage?: number
          answers?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          material_id?: string | null
          topic?: string
          score?: number
          total_questions?: number
          percentage?: number
          answers?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_quiz_attempts_material_user'
            columns: ['material_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'materials'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      tutor_conversations: {
        Row: {
          id: string
          user_id: string
          material_id: string | null
          title: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          material_id?: string | null
          title?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          material_id?: string | null
          title?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_tutor_conversations_material_user'
            columns: ['material_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'materials'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      tutor_messages: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          role: TutorRole
          text: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          role: TutorRole
          text: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          user_id?: string
          role?: TutorRole
          text?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_tutor_messages_parent_conversation'
            columns: ['conversation_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'tutor_conversations'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      scan_queries: {
        Row: {
          id: string
          user_id: string
          question_text: string
          image_path: string | null
          mode: ScanQueryMode
          answer_text: string | null
          source_citation: string | null
          confidence: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          question_text: string
          image_path?: string | null
          mode?: ScanQueryMode
          answer_text?: string | null
          source_citation?: string | null
          confidence?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          question_text?: string
          image_path?: string | null
          mode?: ScanQueryMode
          answer_text?: string | null
          source_citation?: string | null
          confidence?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type UserSettingsRow = Database['public']['Tables']['user_settings']['Row']
export type MaterialRow = Database['public']['Tables']['materials']['Row']
export type StudyNoteRow = Database['public']['Tables']['study_notes']['Row']
export type QuizAttemptRow = Database['public']['Tables']['quiz_attempts']['Row']
export type TutorConversationRow = Database['public']['Tables']['tutor_conversations']['Row']
export type TutorMessageRow = Database['public']['Tables']['tutor_messages']['Row']
export type ScanQueryRow = Database['public']['Tables']['scan_queries']['Row']
