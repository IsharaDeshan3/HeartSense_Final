"""

Agents module for KRA-ORA Medical Diagnosis System



KRA (Knowledge Reasoning Agent): Meditron-7B based reasoning

ORA (Output Refinement Agent): OpenChat-3.5 based output refinement

"""



from .kra_agent import KRAAgent ,KRAOutput ,Diagnosis ,create_kra_agent 

from .ora_agent import ORAAgent ,ORAOutput ,ExperienceLevel ,create_ora_agent 



__all__ =[

"KRAAgent",

"KRAOutput",

"Diagnosis",

"create_kra_agent",

"ORAAgent",

"ORAOutput",

"ExperienceLevel",

"create_ora_agent",

]

