"""

Analysis Routes - Main diagnosis pipeline endpoint

Handles the medical analysis workflow: Intake -> KRA -> ORA

"""



import os 

import sys 

import time 

import logging 

from pathlib import Path 

from typing import Optional ,Dict ,Any ,List ,cast 

from datetime import datetime 



from fastapi import APIRouter ,HTTPException ,Depends ,Header ,status 

from pydantic import BaseModel ,Field 





sys .path .insert (0 ,str (Path (__file__ ).parent .parent ))

sys .path .insert (0 ,str (Path (__file__ ).parent .parent .parent ))



from database import get_supabase_client 

from services .retriever import SupabaseRetriever 

from services .embedding import EmbeddingService 

from routes .auth import get_current_user 





from agents .kra_agent import KRAAgent ,KRAOutput ,create_kra_agent 

from agents .ora_agent import ORAAgent ,ORAOutput ,ExperienceLevel ,create_ora_agent 



logger =logging .getLogger (__name__ )

router =APIRouter ()









class ECGData (BaseModel ):

    """ECG analysis result or bypass indicator"""

    status :str =Field (default ="present",description ="'present', 'skipped', or 'error'")

    qrs_duration :Optional [float ]=None 

    st_segment :Optional [str ]=None 

    rhythm :Optional [str ]=None 

    heart_rate :Optional [int ]=None 

    findings :Optional [List [str ]]=None 





class LabData (BaseModel ):

    """Laboratory results or bypass indicator"""

    status :str =Field (default ="present",description ="'present', 'skipped', or 'error'")

    troponin :Optional [float ]=None 

    ldh :Optional [float ]=None 

    bnp :Optional [float ]=None 

    creatinine :Optional [float ]=None 

    hemoglobin :Optional [float ]=None 

    findings :Optional [List [str ]]=None 





class AnalysisRequest (BaseModel ):

    """

    Main analysis request payload from frontend.

    Matches Phase 3.1 payload structure.

    """

    doctor_id :Optional [str ]=None 

    history :str =Field (...,description ="Patient history and symptoms")

    ecg :Optional [ECGData ]=None 

    labs :Optional [LabData ]=None 

    experience_level :str =Field (default ="seasoned",description ="newbie, seasoned, or expert")

    include_rare_cases :bool =True 





class DiagnosisItem (BaseModel ):

    """Single diagnosis with confidence"""

    condition :str 

    confidence :float 

    severity :str 

    evidence :List [str ]=[]





class AnalysisResult (BaseModel ):

    """Complete analysis response"""

    session_id :str 

    status :str 

    confidence :float 

    is_critical :bool 





    primary_diagnosis :str 

    differential_diagnoses :List [str ]

    diagnoses :List [DiagnosisItem ]

    red_flags :List [str ]

    recommended_tests :List [str ]

    uncertainties :List [str ]





    ora_newbie :str 

    ora_pro :str 

    formatted_output :str 





    retrieval_quality :Dict [str ,Any ]

    processing_time_ms :int 

    disclaimer :str 









class AnalysisPipeline :

    """

    Orchestrates the medical analysis pipeline.

    Retrieval -> KRA -> ORA with proper error handling.

    """



    def __init__ (self ):

        self .retriever :Optional [SupabaseRetriever ]=None 

        self .embedding_service :Optional [EmbeddingService ]=None 

        self .kra_agent :Optional [KRAAgent ]=None 

        self .ora_agent :Optional [ORAAgent ]=None 

        self ._initialized =False 



    def initialize (self ):

        """Lazy initialization of components"""

        if self ._initialized :

            return 



        try :

            self .embedding_service =EmbeddingService ()

            self .retriever =SupabaseRetriever (embedding_service =self .embedding_service )

            self .kra_agent =create_kra_agent ()

            self .ora_agent =create_ora_agent (use_local =True )

            self ._initialized =True 

            logger .info ("Analysis pipeline initialized")

        except Exception as e :

            logger .error (f"Pipeline initialization failed: {e }")

            raise 



    def analyze (

    self ,

    request :AnalysisRequest ,

    user_id :str 

    )->AnalysisResult :

        """

        Run the full analysis pipeline.

        

        Args:

            request: Analysis request with patient data

            user_id: Authenticated user ID

            

        Returns:

            Complete analysis result

        """

        self .initialize ()





        if not self .retriever or not self .kra_agent or not self .ora_agent :

            raise HTTPException (

            status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

            detail ="Analysis pipeline not properly initialized"

            )



        start_time =time .time ()

        session_id =f"sess_{int (time .time ())}_{hash (request .history )%10000 }"





        symptoms =self ._build_symptom_text (request )





        context =self .retriever .get_context_string (

        symptoms ,

        top_k =5 ,

        include_rare_cases =request .include_rare_cases 

        )

        quality =self .retriever .calculate_retrieval_quality (symptoms )





        kra_output =self .kra_agent .analyze (

        symptoms =symptoms ,

        context =context ,

        retrieval_quality =quality 

        )





        exp_level =self ._get_experience_level (request .experience_level )





        ora_newbie =self .ora_agent .refine (

        kra_output =kra_output ,

        symptoms =symptoms ,

        experience_level =ExperienceLevel .NEWBIE 

        )



        ora_seasoned =self .ora_agent .refine (

        kra_output =kra_output ,

        symptoms =symptoms ,

        experience_level =ExperienceLevel .SEASONED 

        )





        ora_output =ora_newbie if exp_level ==ExperienceLevel .NEWBIE else ora_seasoned 





        top_diag =kra_output .get_top_diagnosis ()

        confidence =top_diag .confidence if top_diag else 0.0 





        processing_time =int ((time .time ()-start_time )*1000 )



        result =AnalysisResult (

        session_id =session_id ,

        status ="SUCCESS"if kra_output .success else "PARTIAL",

        confidence =confidence ,

        is_critical =confidence <0.6 or kra_output .has_critical_findings (),



        primary_diagnosis =ora_output .primary_diagnosis ,

        differential_diagnoses =ora_output .differential_diagnoses ,

        diagnoses =[

        DiagnosisItem (

        condition =d .condition ,

        confidence =d .confidence ,

        severity =d .severity ,

        evidence =d .evidence 

        )

        for d in kra_output .diagnoses 

        ],

        red_flags =kra_output .red_flags ,

        recommended_tests =kra_output .recommended_tests ,

        uncertainties =kra_output .uncertainties ,



        ora_newbie =ora_newbie .formatted_diagnosis ,

        ora_pro =ora_seasoned .formatted_diagnosis ,

        formatted_output =ora_output .formatted_diagnosis ,



        retrieval_quality =quality ,

        processing_time_ms =processing_time ,

        disclaimer =ora_output .disclaimer 

        )





        self ._save_session (session_id ,user_id ,request ,result )



        return result 



    def _build_symptom_text (self ,request :AnalysisRequest )->str :

        """Build combined symptom text from all inputs"""

        parts =[f"Patient History:\n{request .history }"]



        if request .ecg and request .ecg .status !="skipped":

            ecg_text ="\n\nECG Findings:"

            if request .ecg .qrs_duration :

                ecg_text +=f"\n- QRS Duration: {request .ecg .qrs_duration }ms"

            if request .ecg .st_segment :

                ecg_text +=f"\n- ST Segment: {request .ecg .st_segment }"

            if request .ecg .rhythm :

                ecg_text +=f"\n- Rhythm: {request .ecg .rhythm }"

            if request .ecg .heart_rate :

                ecg_text +=f"\n- Heart Rate: {request .ecg .heart_rate } bpm"

            if request .ecg .findings :

                ecg_text +=f"\n- Findings: {', '.join (request .ecg .findings )}"

            parts .append (ecg_text )

        elif request .ecg and request .ecg .status =="skipped":

            parts .append ("\n\n[ECG: Not performed/Bypassed]")



        if request .labs and request .labs .status !="skipped":

            lab_text ="\n\nLaboratory Results:"

            if request .labs .troponin is not None :

                lab_text +=f"\n- Troponin: {request .labs .troponin }"

            if request .labs .ldh is not None :

                lab_text +=f"\n- LDH: {request .labs .ldh }"

            if request .labs .bnp is not None :

                lab_text +=f"\n- BNP: {request .labs .bnp }"

            if request .labs .creatinine is not None :

                lab_text +=f"\n- Creatinine: {request .labs .creatinine }"

            if request .labs .hemoglobin is not None :

                lab_text +=f"\n- Hemoglobin: {request .labs .hemoglobin }"

            if request .labs .findings :

                lab_text +=f"\n- Findings: {', '.join (request .labs .findings )}"

            parts .append (lab_text )

        elif request .labs and request .labs .status =="skipped":

            parts .append ("\n\n[Labs: Not performed/Bypassed]")



        return "".join (parts )



    def _get_experience_level (self ,level :str )->ExperienceLevel :

        """Convert string to ExperienceLevel enum"""

        level_map ={

        "newbie":ExperienceLevel .NEWBIE ,

        "seasoned":ExperienceLevel .SEASONED ,

        "expert":ExperienceLevel .EXPERT 

        }

        return level_map .get (level .lower (),ExperienceLevel .SEASONED )



    def _save_session (

    self ,

    session_id :str ,

    user_id :str ,

    request :AnalysisRequest ,

    result :AnalysisResult 

    ):

        """Save analysis session to database for audit trail"""

        try :

            supabase =get_supabase_client ()

            supabase .client .table ("analysis_sessions").insert ({

            "session_id":session_id ,

            "doctor_id":user_id ,

            "history_text":request .history ,

            "ecg_result":request .ecg .model_dump ()if request .ecg else None ,

            "lab_result":request .labs .model_dump ()if request .labs else None ,

            "bypassed":{

            "ecg":request .ecg .status =="skipped"if request .ecg else False ,

            "labs":request .labs .status =="skipped"if request .labs else False 

            },

            "final_diagnosis":result .primary_diagnosis ,

            "confidence":result .confidence ,

            "experience_level":request .experience_level ,

            "processing_time_ms":result .processing_time_ms 

            }).execute ()

        except Exception as e :

            logger .error (f"Failed to save session: {e }")







_pipeline =AnalysisPipeline ()









@router .post ("/analyze",response_model =AnalysisResult )

async def analyze (

request :AnalysisRequest ,

authorization :str =Header (...)

):

    """

    Main analysis endpoint.

    

    Accepts patient history, ECG data (optional), and lab data (optional).

    Returns comprehensive diagnosis with confidence scoring.

    

    If confidence < 0.6, response includes is_critical=True for UI alert.

    """

    try :



        user =await get_current_user (authorization )

        user_id =user ["id"]





        if request .experience_level =="seasoned":

            request .experience_level =user .get ("role","seasoned")





        result =_pipeline .analyze (request ,user_id )



        return result 



    except HTTPException :

        raise 

    except Exception as e :

        logger .error (f"Analysis error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail =f"Analysis failed: {str (e )}"

        )





@router .get ("/session/{session_id}")

async def get_session (

session_id :str ,

authorization :str =Header (...)

):

    """

    Get a previous analysis session by ID.

    """

    try :

        user =await get_current_user (authorization )

        supabase =get_supabase_client ()



        response =supabase .client .table ("analysis_sessions").select ("*").eq (

        "session_id",session_id 

        ).single ().execute ()



        if not response .data :

            raise HTTPException (

            status_code =status .HTTP_404_NOT_FOUND ,

            detail ="Session not found"

            )





        session =cast (Dict [str ,Any ],response .data )

        if session ["doctor_id"]!=user ["id"]and user ["role"]!="admin":

            raise HTTPException (

            status_code =status .HTTP_403_FORBIDDEN ,

            detail ="Access denied"

            )



        return session 



    except HTTPException :

        raise 

    except Exception as e :

        logger .error (f"Session fetch error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to fetch session"

        )





@router .get ("/history")

async def get_analysis_history (

limit :int =20 ,

authorization :str =Header (...)

):

    """

    Get user's analysis history.

    """

    try :

        user =await get_current_user (authorization )

        supabase =get_supabase_client ()



        response =supabase .client .table ("analysis_sessions").select (

        "session_id, final_diagnosis, confidence, created_at"

        ).eq (

        "doctor_id",user ["id"]

        ).order (

        "created_at",desc =True 

        ).limit (limit ).execute ()



        return {"sessions":response .data or []}



    except Exception as e :

        logger .error (f"History fetch error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to fetch history"

        )

