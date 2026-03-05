"""

Admin Routes - Administrative oversight and monitoring

Implements Phase 5: Admin dashboard, feedback approval, system health

"""



import logging 

from typing import Optional ,List ,Dict ,Any ,cast 

from datetime import datetime 



from fastapi import APIRouter ,HTTPException ,Depends ,Header ,status 

from pydantic import BaseModel ,Field 



from database import get_supabase_client 

from services .embedding import EmbeddingService 

from routes .auth import get_current_user 



logger =logging .getLogger (__name__ )

router =APIRouter ()









class FeedbackAction (BaseModel ):

    """Admin action on feedback"""

    action :str =Field (...,description ="'approve', 'reject', or 'escalate'")

    admin_notes :Optional [str ]=None 





class UserRoleUpdate (BaseModel ):

    """Update user role"""

    user_id :str 

    new_role :str =Field (...,description ="'admin', 'seasoned', or 'newbie'")





class SystemStats (BaseModel ):

    """System health statistics"""

    total_analyses :int 

    total_users :int 

    pending_feedback :int 

    conflict_feedback :int 

    bypass_stats :dict 

    diagnosis_stats :dict 





class FeedbackQueueItem (BaseModel ):

    """Feedback item for admin review"""

    id :str 

    doctor_id :str 

    doctor_name :Optional [str ]

    doctor_role :Optional [str ]

    original_diagnosis :str 

    proposed_correction :str 

    case_context :dict 

    status :str 

    created_at :str 









async def require_admin (authorization :str =Header (...))->dict :

    """Dependency that requires admin role"""

    user =await get_current_user (authorization )



    if user ["role"]!="admin":

        raise HTTPException (

        status_code =status .HTTP_403_FORBIDDEN ,

        detail ="Admin access required"

        )



    return user 









@router .get ("/stats",response_model =SystemStats )

async def get_system_stats (admin :dict =Depends (require_admin )):

    """

    Get system health statistics for admin dashboard.

    

    Shows:

    - Total analyses

    - User counts

    - Pending/conflict feedback counts

    - Bypass statistics (ECG/Labs)

    - Diagnosis confidence distribution

    """

    try :

        supabase =get_supabase_client ()





        users_response =supabase .admin_client .table ("profiles").select (

        "id",count ="exact"

        ).execute ()

        total_users =users_response .count or 0 





        pending_response =supabase .admin_client .table ("feedback_queue").select (

        "id",count ="exact"

        ).eq ("status","pending").execute ()

        pending_count =pending_response .count or 0 



        conflict_response =supabase .admin_client .table ("feedback_queue").select (

        "id",count ="exact"

        ).eq ("status","conflict").execute ()

        conflict_count =conflict_response .count or 0 





        analysis_response =supabase .admin_client .table ("analysis_sessions").select (

        "id",count ="exact"

        ).execute ()

        total_analyses =analysis_response .count or 0 





        bypass_stats =supabase .get_bypass_stats ()

        diagnosis_stats =supabase .get_diagnosis_stats ()



        return SystemStats (

        total_analyses =total_analyses ,

        total_users =total_users ,

        pending_feedback =pending_count ,

        conflict_feedback =conflict_count ,

        bypass_stats =bypass_stats ,

        diagnosis_stats =diagnosis_stats 

        )



    except Exception as e :

        logger .error (f"Stats fetch error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to fetch system stats"

        )





@router .get ("/feedback/queue")

async def get_feedback_queue (

status_filter :Optional [str ]=None ,

limit :int =50 ,

admin :dict =Depends (require_admin )

):

    """

    Get feedback queue for admin review.

    

    Args:

        status_filter: Filter by 'pending', 'conflict', 'approved', 'rejected'

        limit: Maximum items to return

    """

    try :

        supabase =get_supabase_client ()





        query =supabase .admin_client .table ("feedback_queue").select (

        "*, profiles!feedback_queue_doctor_id_fkey(full_name, role)"

        )



        if status_filter :

            query =query .eq ("status",status_filter )



        response =query .order ("created_at",desc =True ).limit (limit ).execute ()





        items =[]

        data_list =cast (List [Dict [str ,Any ]],response .data )if response .data else []

        for item in data_list :

            profile =item .pop ("profiles",{})or {}

            if isinstance (profile ,dict ):

                items .append ({

                **item ,

                "doctor_name":profile .get ("full_name"),

                "doctor_role":profile .get ("role")

                })

            else :

                items .append ({

                **item ,

                "doctor_name":None ,

                "doctor_role":None 

                })



        return {"queue":items }



    except Exception as e :

        logger .error (f"Queue fetch error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to fetch feedback queue"

        )





@router .post ("/feedback/{feedback_id}/action")

async def process_feedback_action (

feedback_id :str ,

action :FeedbackAction ,

admin :dict =Depends (require_admin )

):

    """

    Process admin action on feedback.

    

    - 'approve': Add to knowledge base and mark approved

    - 'reject': Mark as rejected with notes

    - 'escalate': Mark for further review

    """

    try :

        supabase =get_supabase_client ()





        response =supabase .admin_client .table ("feedback_queue").select ("*").eq (

        "id",feedback_id 

        ).single ().execute ()



        if not response .data :

            raise HTTPException (

            status_code =status .HTTP_404_NOT_FOUND ,

            detail ="Feedback not found"

            )



        feedback =cast (Dict [str ,Any ],response .data )



        if action .action =="approve":



            embedding_service =EmbeddingService ()

            case_context =feedback .get ("case_context",{})

            if not isinstance (case_context ,dict ):

                case_context ={}



            content =(

            f"Case: {case_context .get ('history','N/A')}\n"

            f"Diagnosis: {feedback .get ('proposed_correction','N/A')}\n"

            f"Reasoning: {case_context .get ('reasoning','Admin approved correction')}"

            )



            embedding =embedding_service .embed (content )



            supabase .add_knowledge (

            content =content ,

            embedding =embedding ,

            source_type ="feedback"

            )





            supabase .admin_client .table ("feedback_queue").update ({

            "status":"approved",

            "admin_notes":action .admin_notes ,

            "reviewed_by":admin ["id"],

            "reviewed_at":datetime .utcnow ().isoformat ()

            }).eq ("id",feedback_id ).execute ()



            return {"message":"Feedback approved and added to knowledge base"}



        elif action .action =="reject":

            supabase .admin_client .table ("feedback_queue").update ({

            "status":"rejected",

            "admin_notes":action .admin_notes ,

            "reviewed_by":admin ["id"],

            "reviewed_at":datetime .utcnow ().isoformat ()

            }).eq ("id",feedback_id ).execute ()



            return {"message":"Feedback rejected"}



        elif action .action =="escalate":

            supabase .admin_client .table ("feedback_queue").update ({

            "admin_notes":f"ESCALATED: {action .admin_notes or 'Requires expert review'}",

            "reviewed_by":admin ["id"]

            }).eq ("id",feedback_id ).execute ()



            return {"message":"Feedback escalated for further review"}



        else :

            raise HTTPException (

            status_code =status .HTTP_400_BAD_REQUEST ,

            detail =f"Invalid action: {action .action }"

            )



    except HTTPException :

        raise 

    except Exception as e :

        logger .error (f"Feedback action error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to process feedback action"

        )





@router .get ("/users")

async def get_users (

role_filter :Optional [str ]=None ,

limit :int =50 ,

admin :dict =Depends (require_admin )

):

    """

    Get list of users for admin management.

    """

    try :

        supabase =get_supabase_client ()



        query =supabase .admin_client .table ("profiles").select ("*")



        if role_filter :

            query =query .eq ("role",role_filter )



        response =query .order ("created_at",desc =True ).limit (limit ).execute ()



        return {"users":response .data or []}



    except Exception as e :

        logger .error (f"Users fetch error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to fetch users"

        )





@router .post ("/users/role")

async def update_user_role (

update :UserRoleUpdate ,

admin :dict =Depends (require_admin )

):

    """

    Update a user's role.

    """

    try :

        if update .new_role not in ["admin","seasoned","newbie"]:

            raise HTTPException (

            status_code =status .HTTP_400_BAD_REQUEST ,

            detail ="Invalid role"

            )



        supabase =get_supabase_client ()



        success =supabase .update_user_role (update .user_id ,update .new_role )



        if success :

            return {"message":f"User role updated to {update .new_role }"}

        else :

            raise HTTPException (

            status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

            detail ="Failed to update role"

            )



    except HTTPException :

        raise 

    except Exception as e :

        logger .error (f"Role update error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to update user role"

        )





@router .get ("/analyses")

async def get_all_analyses (

limit :int =50 ,

low_confidence_only :bool =False ,

admin :dict =Depends (require_admin )

):

    """

    Get all analysis sessions for admin review.

    

    Args:

        limit: Maximum items to return

        low_confidence_only: If true, only return confidence < 0.6

    """

    try :

        supabase =get_supabase_client ()



        query =supabase .admin_client .table ("analysis_sessions").select (

        "*, profiles!analysis_sessions_doctor_id_fkey(full_name)"

        )



        if low_confidence_only :

            query =query .lt ("confidence",0.6 )



        response =query .order ("created_at",desc =True ).limit (limit ).execute ()





        items =[]

        data_list =cast (List [Dict [str ,Any ]],response .data )if response .data else []

        for item in data_list :

            profile =item .pop ("profiles",{})or {}

            if isinstance (profile ,dict ):

                items .append ({

                **item ,

                "doctor_name":profile .get ("full_name")

                })

            else :

                items .append ({

                **item ,

                "doctor_name":None 

                })



        return {"analyses":items }



    except Exception as e :

        logger .error (f"Analyses fetch error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to fetch analyses"

        )





@router .get ("/knowledge/stats")

async def get_knowledge_stats (admin :dict =Depends (require_admin )):

    """

    Get knowledge base statistics.

    """

    try :

        supabase =get_supabase_client ()





        response =supabase .admin_client .table ("medical_knowledge").select (

        "source_type"

        ).execute ()



        data_list =cast (List [Dict [str ,Any ]],response .data )if response .data else []

        source_counts :Dict [str ,int ]={}

        for item in data_list :

            source =item .get ("source_type","unknown")

            source_counts [source ]=source_counts .get (source ,0 )+1 



        return {

        "total_entries":len (data_list ),

        "by_source":source_counts 

        }



    except Exception as e :

        logger .error (f"Knowledge stats error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to fetch knowledge stats"

        )

