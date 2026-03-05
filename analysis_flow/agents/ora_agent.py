"""\

ORA Agent - Output Refinement Agent



Refines KRA output into clinician-facing text. Supports:

- API mode: calls a Hugging Face Space (Gradio `/api/predict`).

- Local mode: lightweight deterministic formatter (no LLM) for offline/dev.



Expected HF Space Gradio inputs (recommended):

1) `kra_json` (stringified JSON dict)

2) `symptoms` (string)

3) `experience_level` (string: NEWBIE|SEASONED|EXPERT)



Expected HF Space output:

- Either a JSON string/dict with fields matching ORAOutput, or

- A plain text string (stored as `formatted_diagnosis`).

"""



import os 

import json 

import logging 

from dataclasses import dataclass ,field 

from enum import Enum 

from typing import Any ,Dict ,List ,Optional 



import requests 

from dotenv import load_dotenv ,find_dotenv 



from agents .kra_agent import KRAOutput 





load_dotenv (find_dotenv ())

logger =logging .getLogger (__name__ )





class ExperienceLevel (Enum ):

    NEWBIE ="newbie"

    SEASONED ="seasoned"

    EXPERT ="expert"





@dataclass 

class ORAOutput :

    """Final clinician-facing output from ORA."""



    primary_diagnosis :str =""

    differential_diagnoses :List [str ]=field (default_factory =list )

    formatted_diagnosis :str =""

    disclaimer :str =""

    validation_passed :bool =True 

    raw_output :str =""

    success :bool =True 

    error_message :str =""



    def to_dict (self )->Dict [str ,Any ]:

        return {

        "primary_diagnosis":self .primary_diagnosis ,

        "differential_diagnoses":self .differential_diagnoses ,

        "formatted_diagnosis":self .formatted_diagnosis ,

        "disclaimer":self .disclaimer ,

        "validation_passed":self .validation_passed ,

        "success":self .success ,

        "error_message":self .error_message ,

        }





class ORAAgent :

    """Output Refinement Agent client (HF Space or local formatter)."""



    def __init__ (

    self ,

    use_local :bool =False ,

    hf_token :Optional [str ]=None ,

    endpoint :Optional [str ]=None ,

    timeout :int =120 ,

    ):

        self .use_local =use_local 

        self .hf_token =hf_token or os .getenv ("HF_TOKEN")

        self .timeout =timeout 



        self .endpoint =endpoint or os .getenv ("ORA_ENDPOINT")

        if not self .use_local :

            if not self .endpoint :

                raise ValueError (

                "ORA endpoint not configured. Set ORA_ENDPOINT or use_local=True."

                )



            self .endpoint =str (self .endpoint )

            if not self .endpoint .endswith ("/api/predict"):

                self .endpoint =self .endpoint .rstrip ("/")+"/api/predict"



        self .headers ={"Content-Type":"application/json"}

        if self .hf_token :

            self .headers ["Authorization"]=f"Bearer {self .hf_token }"



        mode ="LOCAL"if self .use_local else "API"

        logger .info (f"ORA Agent initialized in {mode } mode")



    def refine (

    self ,

    kra_output :KRAOutput ,

    symptoms :str ,

    experience_level :ExperienceLevel =ExperienceLevel .SEASONED ,

    )->ORAOutput :

        """Refine KRA output into clinician-facing output."""



        if self .use_local :

            return self ._local_refine (kra_output ,symptoms ,experience_level )



        endpoint =self .endpoint 

        if not endpoint :

            return ORAOutput (

            success =False ,

            validation_passed =False ,

            error_message ="ORA endpoint not configured.",

            )



        payload ={

        "data":[

        json .dumps (kra_output .to_dict ()),

        symptoms ,

        experience_level .name ,

        ]

        }



        try :

            resp =requests .post (

            endpoint ,

            json =payload ,

            headers =self .headers ,

            timeout =self .timeout ,

            )

            resp .raise_for_status ()

            result =resp .json ()



            if "data"not in result or not result ["data"]:

                raise ValueError ("Invalid response format from ORA")



            output_data =result ["data"][0 ]





            if isinstance (output_data ,str ):

                try :

                    output_data_json =json .loads (output_data )

                    return self ._parse_response (output_data_json ,kra_output )

                except json .JSONDecodeError :

                    formatted =output_data 

                    parsed =self ._build_minimal_output (formatted ,kra_output )

                    parsed .raw_output =output_data 

                    return parsed 



            if isinstance (output_data ,dict ):

                return self ._parse_response (output_data ,kra_output )



            raise ValueError ("Unsupported ORA output type")



        except requests .exceptions .Timeout :

            return ORAOutput (

            success =False ,

            validation_passed =False ,

            error_message ="ORA request timed out. The model may be loading.",

            )

        except requests .exceptions .RequestException as e :

            return ORAOutput (

            success =False ,

            validation_passed =False ,

            error_message =f"ORA connection failed: {str (e )}",

            )

        except Exception as e :

            return ORAOutput (

            success =False ,

            validation_passed =False ,

            error_message =f"ORA refinement error: {str (e )}",

            )



    def _parse_response (self ,data :Dict [str ,Any ],kra_output :KRAOutput )->ORAOutput :

        formatted =data .get ("formatted_diagnosis")or data .get ("formatted")or ""

        primary =data .get ("primary_diagnosis")or data .get ("primary")or ""

        differential =data .get ("differential_diagnoses")or data .get ("differential")or []

        disclaimer =data .get ("disclaimer")or self ._default_disclaimer ()



        out =ORAOutput (

        primary_diagnosis =primary ,

        differential_diagnoses =list (differential )if isinstance (differential ,list )else [],

        formatted_diagnosis =formatted ,

        disclaimer =disclaimer ,

        validation_passed =bool (data .get ("validation_passed",True )),

        raw_output =json .dumps (data ),

        success =True ,

        )





        if "validation_passed"not in data :

            out .validation_passed =self ._basic_validation (out ,kra_output )





        if not out .primary_diagnosis :

            top =kra_output .get_top_diagnosis ()

            out .primary_diagnosis =top .condition if top else ""





        if not out .formatted_diagnosis :

            out .formatted_diagnosis =self ._format_from_kra (kra_output )



        return out 



    def _basic_validation (self ,ora :ORAOutput ,kra_output :KRAOutput )->bool :

        if not kra_output .diagnoses :

            return False 

        top =kra_output .get_top_diagnosis ()

        if not top :

            return False 



        if ora .primary_diagnosis and ora .primary_diagnosis .strip ().lower ()==top .condition .strip ().lower ():

            return True 

        kra_conditions ={d .condition .strip ().lower ()for d in kra_output .diagnoses }

        if ora .primary_diagnosis and ora .primary_diagnosis .strip ().lower ()in kra_conditions :

            return True 

        return False 



    def _build_minimal_output (self ,formatted :str ,kra_output :KRAOutput )->ORAOutput :

        top =kra_output .get_top_diagnosis ()

        primary =top .condition if top else ""

        differential =[d .condition for d in kra_output .diagnoses [1 :4 ]]if kra_output .diagnoses else []

        return ORAOutput (

        primary_diagnosis =primary ,

        differential_diagnoses =differential ,

        formatted_diagnosis =formatted ,

        disclaimer =self ._default_disclaimer (),

        validation_passed =True ,

        success =True ,

        )



    def _local_refine (

    self ,

    kra_output :KRAOutput ,

    symptoms :str ,

    experience_level :ExperienceLevel ,

    )->ORAOutput :

        if not kra_output .diagnoses :

            return ORAOutput (

            success =False ,

            validation_passed =False ,

            error_message ="No diagnoses available from KRA.",

            )



        top =kra_output .get_top_diagnosis ()

        primary =top .condition if top else kra_output .diagnoses [0 ].condition 

        differential =[d .condition for d in kra_output .diagnoses [1 :5 ]]



        formatted =self ._format_local (symptoms ,kra_output ,experience_level )



        return ORAOutput (

        primary_diagnosis =primary ,

        differential_diagnoses =differential ,

        formatted_diagnosis =formatted ,

        disclaimer =self ._default_disclaimer (),

        validation_passed =True ,

        raw_output ="local",

        success =True ,

        )



    def _format_local (self ,symptoms :str ,kra_output :KRAOutput ,level :ExperienceLevel )->str :

        top =kra_output .get_top_diagnosis ()

        dx_lines =[]

        for i ,d in enumerate (kra_output .diagnoses [:5 ],1 ):

            dx_lines .append (f"{i }. {d .condition } (confidence: {d .confidence :.2f}, severity: {d .severity })")



        tests =kra_output .recommended_tests [:6 ]

        red_flags =kra_output .red_flags [:6 ]

        uncertainties =kra_output .uncertainties [:6 ]



        if level ==ExperienceLevel .NEWBIE :

            style ="Plain-language, step-by-step."

        elif level ==ExperienceLevel .EXPERT :

            style ="Concise, high-signal."

        else :

            style ="Clinician-friendly."



        sections =[

        "===================================================================",

        "                    CLINICAL DECISION SUPPORT (ORA)",

        "===================================================================",

        f"OUTPUT STYLE: {style }",

        "",

        "PATIENT PRESENTATION:",

        symptoms .strip (),

        "",

        "TOP DIFFERENTIAL (from KRA):",

        "\n".join (dx_lines ),

        ]



        if red_flags :

            sections +=["","RED FLAGS (urgent):","\n".join (f"- {x }"for x in red_flags )]



        if tests :

            sections +=["","RECOMMENDED TESTS / NEXT STEPS:","\n".join (f"- {x }"for x in tests )]



        if uncertainties :

            sections +=["","UNCERTAINTIES / MISSING INFO:","\n".join (f"- {x }"for x in uncertainties )]



        sections +=["","NOTES:","- Use full clinical context, vitals, ECG/labs/imaging as appropriate."]

        sections +=["==================================================================="]

        return "\n".join (sections )



    def _format_from_kra (self ,kra_output :KRAOutput )->str :

        lines =["KRA Summary:"]

        for d in kra_output .diagnoses [:5 ]:

            lines .append (f"- {d .condition } ({d .confidence :.2f})")

        return "\n".join (lines )



    def _default_disclaimer (self )->str :

        return (

        "[!] DISCLAIMER: This system is a research prototype and does not provide medical diagnosis. "

        "Use with clinical judgment and verify with appropriate tests and guidelines."

        )





def create_ora_agent (

use_local :bool =False ,

hf_token :Optional [str ]=None ,

endpoint :Optional [str ]=None ,

timeout :int =120 ,

)->ORAAgent :

    return ORAAgent (

    use_local =use_local ,

    hf_token =hf_token ,

    endpoint =endpoint ,

    timeout =timeout ,

    )

