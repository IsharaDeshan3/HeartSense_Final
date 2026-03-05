"""

Feedback Routes - Doctor feedback and self-learning mechanism

Implements Phase 4: Improvement Feedback Loop with conflict resolution

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









class FeedbackSubmission (BaseModel ):

    """Doctor feedback on a diagnosis"""

    session_id :str =Field (...,description ="Analysis session being corrected")

    original_diagnosis :str =Field (...,description ="System's original diagnosis")

    proposed_correction :str =Field (...,description ="Doctor's suggested diagnosis")

    case_context :dict =Field (...,description ="Full case context for review")

    reasoning :Optional [str ]=Field (None ,description ="Doctor's reasoning for correction")





class FeedbackResponse (BaseModel ):

    """Response after feedback submission"""

    feedback_id :str 

    status :str 

    message :str 

    conflict_details :Optional [dict ]=None 





class FeedbackItem (BaseModel ):

    """Feedback queue item"""

    id :str 

    doctor_id :str 

    original_diagnosis :str 

    proposed_correction :str 

    case_context :dict 

    status :str 

    created_at :str 

    doctor_name :Optional [str ]=None 

    doctor_role :Optional [str ]=None 









_embedding_service :Optional [EmbeddingService ]=None 





def get_embedding_service ()->EmbeddingService :

    global _embedding_service 

    if _embedding_service is None :

        _embedding_service =EmbeddingService ()

    return _embedding_service 









async def process_feedback (

submission :FeedbackSubmission ,

user_id :str ,

user_role :str 

)->FeedbackResponse :

    """

    Process feedback according to Phase 4 rules:

    

    1. Check for conflicts with existing knowledge (60% similarity)

    2. Role-based handling:

       - Seasoned + No Conflict: Update knowledge instantly

       - Seasoned + Conflict: Send to queue with status 'conflict'

       - Newbie: Always send to queue with status 'pending'

    """

    supabase =get_supabase_client ()

    embedding_service =get_embedding_service ()





    correction_embedding =embedding_service .embed (

    f"{submission .case_context .get ('history','')} {submission .proposed_correction }"

    )





    conflict_result =supabase .check_conflict (

    embedding =correction_embedding ,

    proposed_diagnosis =submission .proposed_correction 

    )



    is_conflict =conflict_result .get ("is_conflict",False )

    existing_diagnosis =conflict_result .get ("existing_diagnosis")





    if user_role =="seasoned"and not is_conflict :



        knowledge_id =supabase .add_knowledge (

        content =f"Case: {submission .case_context .get ('history','N/A')}\n"

        f"Diagnosis: {submission .proposed_correction }\n"

        f"Reasoning: {submission .reasoning or 'N/A'}",

        embedding =correction_embedding ,

        source_type ="feedback"

        )



        return FeedbackResponse (

        feedback_id =knowledge_id or "direct-update",

        status ="approved",

        message ="Your correction has been added to the knowledge base immediately."

        )



    elif user_role =="seasoned"and is_conflict :



        feedback_id =supabase .submit_feedback (

        doctor_id =user_id ,

        original_diagnosis =submission .original_diagnosis ,

        proposed_correction =submission .proposed_correction ,

        case_context ={

        **submission .case_context ,

        "reasoning":submission .reasoning ,

        "session_id":submission .session_id 

        }

        )



        return FeedbackResponse (

        feedback_id =feedback_id or "conflict-queued",

        status ="conflict",

        message ="Your correction conflicts with existing knowledge. Sent to admin for review.",

        conflict_details ={

        "existing_diagnosis":existing_diagnosis ,

        "similarity_threshold":"60%"

        }

        )



    else :



        feedback_id =supabase .submit_feedback (

        doctor_id =user_id ,

        original_diagnosis =submission .original_diagnosis ,

        proposed_correction =submission .proposed_correction ,

        case_context ={

        **submission .case_context ,

        "reasoning":submission .reasoning ,

        "session_id":submission .session_id 

        }

        )



        return FeedbackResponse (

        feedback_id =feedback_id or "pending-queued",

        status ="pending",

        message ="Your feedback has been submitted for admin review. Thank you for contributing!"

        )









@router .post ("/submit",response_model =FeedbackResponse )

async def submit_feedback (

submission :FeedbackSubmission ,

authorization :str =Header (...)

):

    """

    Submit feedback on a diagnosis.

    

    Called when doctor clicks "No" on "Was this diagnosis correct?"

    

    Processing depends on doctor's role:

    - Seasoned doctors: Direct update if no conflict, else queued

    - Newbie doctors: Always queued for admin review

    """

    try :

        user =await get_current_user (authorization )



        result =await process_feedback (

        submission =submission ,

        user_id =user ["id"],

        user_role =user ["role"]

        )



        return result 



    except HTTPException :

        raise 

    except Exception as e :

        logger .error (f"Feedback submission error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail =f"Failed to submit feedback: {str (e )}"

        )





@router .get ("/my-submissions")

async def get_my_submissions (

status_filter :Optional [str ]=None ,

limit :int =20 ,

authorization :str =Header (...)

):

    """

    Get current user's feedback submissions.

    """

    try :

        user =await get_current_user (authorization )

        supabase =get_supabase_client ()



        query =supabase .client .table ("feedback_queue").select ("*").eq (

        "doctor_id",user ["id"]

        )



        if status_filter :

            query =query .eq ("status",status_filter )



        response =query .order ("created_at",desc =True ).limit (limit ).execute ()



        return {"submissions":response .data or []}



    except Exception as e :

        logger .error (f"Submissions fetch error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to fetch submissions"

        )





@router .get ("/status/{feedback_id}")

async def get_feedback_status (

feedback_id :str ,

authorization :str =Header (...)

):

    """

    Check status of a specific feedback submission.

    """

    try :

        user =await get_current_user (authorization )

        supabase =get_supabase_client ()



        response =supabase .client .table ("feedback_queue").select ("*").eq (

        "id",feedback_id 

        ).single ().execute ()



        if not response .data :

            raise HTTPException (

            status_code =status .HTTP_404_NOT_FOUND ,

            detail ="Feedback not found"

            )





        data =cast (Dict [str ,Any ],response .data )

        if data ["doctor_id"]!=user ["id"]and user ["role"]!="admin":

            raise HTTPException (

            status_code =status .HTTP_403_FORBIDDEN ,

            detail ="Access denied"

            )



        return data 



    except HTTPException :

        raise 

    except Exception as e :

        logger .error (f"Feedback status error: {e }")

        raise HTTPException (

        status_code =status .HTTP_500_INTERNAL_SERVER_ERROR ,

        detail ="Failed to fetch feedback status"

        )

